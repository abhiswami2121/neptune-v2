/**
 * Session Store — U2.5A.2
 *
 * Durable agent session storage with:
 * - Postgres for session metadata (CRUD, listing, querying)
 * - Upstash Redis for real-time event streaming (SSE)
 *
 * Auth: NEPTUNE_INTERNAL_TOKEN Bearer for programmatic access,
 *       session cookie for browser-based access.
 */

import { eq, desc, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentSessions, type AgentSession, type NewAgentSession } from "@/lib/db/schema";
import { createRedisClient, isRedisConfigured } from "@/lib/redis";
import type { Redis } from "ioredis";

// ── Runtime table safety (M-NEPTUNE-FIXES-V2-AUDIT Phase A) ────────────────
let tableEnsured = false;
async function ensureAgentSessionsTable(): Promise<void> {
  if (tableEnsured) return;
  try {
    // Use raw postgres client — Drizzle proxy won't route raw SQL correctly
    const pg = await import("postgres");
    const sql_client = pg.default(process.env.POSTGRES_URL!, { max: 1 });
    await sql_client.unsafe(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id text PRIMARY KEY NOT NULL,
        goal text,
        model text,
        status text DEFAULT 'started' NOT NULL,
        mode text DEFAULT 'sandbox',
        repo text,
        branch text,
        pr_url text,
        deploy_url text,
        error text,
        sandbox_id text,
        chat_id text,
        v2_session_id text,
        duration_ms integer,
        started_at timestamp DEFAULT now() NOT NULL,
        completed_at timestamp,
        created_at timestamp DEFAULT now() NOT NULL,
        updated_at timestamp DEFAULT now() NOT NULL,
        checkpoint_json jsonb,
        parent_session_id text,
        checkpoint_count integer DEFAULT 0 NOT NULL
      )
    `);
    await sql_client.unsafe(`CREATE INDEX IF NOT EXISTS agent_sessions_status_idx ON agent_sessions (status)`);
    await sql_client.unsafe(`CREATE INDEX IF NOT EXISTS agent_sessions_created_at_idx ON agent_sessions (created_at)`);
    await sql_client.end();
    console.log("[session-store] ✅ agent_sessions table ensured via raw SQL");
    tableEnsured = true;
  } catch (err) {
    console.error("[session-store] ⚠️ Could not ensure agent_sessions table:", (err as Error).message);
    throw err; // Let caller see the real error
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export type AgentSessionStatus = "started" | "running" | "completed" | "failed" | "aborted" | "stalled";

export interface AgentSessionEvent {
  type: string;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface CreateAgentSessionParams {
  goal?: string;
  model?: string;
  mode?: string;
  repo?: string;
  branch?: string;
  chatId?: string;
  v2SessionId?: string;
}

export interface AgentSessionListResult {
  sessions: AgentSession[];
  total: number;
}

// ── Redis helpers ──────────────────────────────────────────────────────────

const EVENT_STREAM_PREFIX = "agent_session:";
const MAX_EVENTS_PER_SESSION = 500;

function getRedisKey(sessionId: string): string {
  return `${EVENT_STREAM_PREFIX}${sessionId}:events`;
}

function getRedis(): Redis | null {
  try {
    if (!isRedisConfigured()) return null;
    return createRedisClient("session-store");
  } catch {
    return null;
  }
}

// ── Postgres CRUD ──────────────────────────────────────────────────────────

export async function createAgentSession(
  params: CreateAgentSessionParams,
): Promise<AgentSession> {
  const id = crypto.randomUUID();
  const now = new Date();

  const newSession: NewAgentSession = {
    id,
    goal: params.goal || null,
    model: params.model || null,
    mode: params.mode || "sandbox",
    status: "started",
    repo: params.repo || null,
    branch: params.branch || null,
    chatId: params.chatId || null,
    sessionId: params.v2SessionId || null,
    startedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await ensureAgentSessionsTable();
  await db.insert(agentSessions).values(newSession);
  return newSession as unknown as AgentSession;
}

export async function getAgentSession(
  id: string,
): Promise<AgentSession | null> {
  const rows = await db
    .select()
    .from(agentSessions)
    .where(eq(agentSessions.id, id))
    .limit(1);

  return (rows[0] as AgentSession) || null;
}

export async function listAgentSessions(
  limit = 50,
  offset = 0,
): Promise<AgentSessionListResult> {
  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(agentSessions)
      .orderBy(desc(agentSessions.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(agentSessions),
  ]);

  return {
    sessions: rows as AgentSession[],
    total: Number(countResult[0]?.count ?? 0),
  };
}

export async function updateAgentSession(
  id: string,
  updates: Partial<Pick<AgentSession, "status" | "goal" | "model" | "repo" | "branch" | "prUrl" | "deployUrl" | "error" | "sandboxId" | "durationMs" | "completedAt" | "checkpointJson" | "parentSessionId" | "checkpointCount">>,
): Promise<AgentSession | null> {
  const now = new Date();

  // If transitioning to a terminal state, set completedAt
  const terminalStates: AgentSessionStatus[] = ["completed", "failed", "aborted"];
  const patch: Record<string, unknown> = {
    ...updates,
    updatedAt: now,
  };

  if (updates.status && terminalStates.includes(updates.status)) {
    patch.completedAt = now;
  }

  const rows = await db
    .update(agentSessions)
    .set(patch as any)
    .where(eq(agentSessions.id, id))
    .returning();

  return (rows[0] as AgentSession) || null;
}

// ── Checkpoint Persistence (Phase 2) ───────────────────────────────────────

/**
 * Save a full checkpoint snapshot to the agent_sessions row.
 * Updates checkpoint_json, checkpoint_count, and status if transitioning.
 */
export async function saveSessionCheckpoint(
  id: string,
  checkpoint: {
    checkpointJson: Record<string, unknown>;
    checkpointCount: number;
    status?: AgentSessionStatus;
    accumulatedTextPreview?: string;
    error?: string;
  },
): Promise<void> {
  const now = new Date();
  const patch: Record<string, unknown> = {
    checkpointJson: JSON.stringify(checkpoint.checkpointJson),
    checkpointCount: checkpoint.checkpointCount,
    updatedAt: now,
  };

  if (checkpoint.status) {
    patch.status = checkpoint.status;
  }

  if (checkpoint.error !== undefined) {
    patch.error = checkpoint.error;
  }

  try {
    await db
      .update(agentSessions)
      .set(patch as any)
      .where(eq(agentSessions.id, id));
  } catch (err) {
    console.error(
      `[session-store] Failed to save checkpoint for ${id.slice(0, 12)}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/**
 * Load the latest checkpoint state for a session.
 * Returns null if no checkpoint has been saved.
 */
export async function loadSessionCheckpoint(
  id: string,
): Promise<Record<string, unknown> | null> {
  try {
    const rows = await db
      .select({
        checkpointJson: agentSessions.checkpointJson,
        checkpointCount: agentSessions.checkpointCount,
        parentSessionId: agentSessions.parentSessionId,
        status: agentSessions.status,
      })
      .from(agentSessions)
      .where(eq(agentSessions.id, id))
      .limit(1);

    const row = rows[0];
    if (!row?.checkpointJson) return null;

    const parsed =
      typeof row.checkpointJson === "string"
        ? JSON.parse(row.checkpointJson)
        : row.checkpointJson;

    return {
      ...(parsed as Record<string, unknown>),
      checkpointCount: row.checkpointCount,
      parentSessionId: row.parentSessionId,
      status: row.status,
    };
  } catch (err) {
    console.error(
      `[session-store] Failed to load checkpoint for ${id.slice(0, 12)}:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/**
 * Link a session to its parent (for auto-continue chains).
 */
export async function linkSessionToParent(
  childId: string,
  parentId: string,
): Promise<void> {
  try {
    await db
      .update(agentSessions)
      .set({
        parentSessionId: parentId,
        updatedAt: new Date(),
      } as any)
      .where(eq(agentSessions.id, childId));
  } catch (err) {
    console.error(
      `[session-store] Failed to link ${childId.slice(0, 12)} → ${parentId.slice(0, 12)}:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

// ── Event Streaming (Redis-backed) ─────────────────────────────────────────

export async function appendSessionEvent(
  sessionId: string,
  type: string,
  data: Record<string, unknown> = {},
): Promise<void> {
  const event: AgentSessionEvent = {
    type,
    sessionId,
    timestamp: Date.now(),
    data,
  };

  const redis = getRedis();
  if (redis) {
    try {
      const key = getRedisKey(sessionId);
      await redis.rpush(key, JSON.stringify(event));
      // Keep only last MAX_EVENTS_PER_SESSION events
      await redis.ltrim(key, -MAX_EVENTS_PER_SESSION, -1);
      // Set TTL: 24 hours
      await redis.expire(key, 86400);
      return;
    } catch {
      // Fall through to console-only
    }
  }

  // No Redis — log for debugging
  console.log(`[session-store] Event: ${type} for ${sessionId.slice(0, 12)}...`);
}

export async function getSessionEvents(
  sessionId: string,
  since?: number,
): Promise<AgentSessionEvent[]> {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const key = getRedisKey(sessionId);
    const raw = await redis.lrange(key, 0, -1);
    const events = raw
      .map((line) => {
        try {
          return JSON.parse(line) as AgentSessionEvent;
        } catch {
          return null;
        }
      })
      .filter((e): e is AgentSessionEvent => e !== null);

    if (since) {
      return events.filter((e) => e.timestamp > since);
    }
    return events;
  } catch {
    return [];
  }
}

// ── SSE Stream Generator ───────────────────────────────────────────────────

/**
 * Generate an SSE stream of session events.
 * Uses Redis polling for compatibility with Upstash (no SUBSCRIBE support).
 */
export async function* generateSSEStream(
  sessionId: string,
  signal?: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  // Send initial connection event
  yield `data: ${JSON.stringify({ type: "connected", sessionId })}\n\n`;

  let lastTimestamp = Date.now();
  let emptyPolls = 0;

  while (!signal?.aborted && emptyPolls < 180) {
    // Check if session exists (completed sessions stop streaming)
    const session = await getAgentSession(sessionId);
    if (!session) {
      yield `data: ${JSON.stringify({ type: "error", message: "Session not found" })}\n\n`;
      return;
    }

    // Terminal states: send final event then stop
    if (["completed", "failed", "aborted"].includes(session.status)) {
      yield `data: ${JSON.stringify({ type: "terminal", status: session.status, completedAt: session.completedAt })}\n\n`;
      return;
    }

    // Poll for new events
    const newEvents = await getSessionEvents(sessionId, lastTimestamp);
    if (newEvents.length > 0) {
      for (const event of newEvents) {
        yield `data: ${JSON.stringify(event)}\n\n`;
        if (event.timestamp > lastTimestamp) {
          lastTimestamp = event.timestamp;
        }
      }
      emptyPolls = 0;
    } else {
      emptyPolls++;
    }

    // Heartbeat every 15s
    if (emptyPolls > 0 && emptyPolls % 15 === 0) {
      yield `: heartbeat\n\n`;
    }

    // Wait 1s between polls
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Timeout after ~3 minutes of empty polls
  yield `data: ${JSON.stringify({ type: "timeout", message: "Stream timed out — no new events for 180s" })}\n\n`;
}

// ── Session Lifecycle Watchdog (Phase 3) ────────────────────────────────────

const STALLED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes in "started" → "stalled"
const FAILED_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes in "stalled" → "failed"

export interface StaleSessionTransition {
  id: string;
  from: AgentSessionStatus;
  to: AgentSessionStatus;
  reason: string;
}

/**
 * Detect and transition stuck sessions:
 * - "started" for >5 minutes → "stalled" (with error reason)
 * - "stalled" for >30 minutes → "failed"
 *
 * Returns the list of sessions that were transitioned.
 */
export async function transitionStaleSessions(): Promise<
  StaleSessionTransition[]
> {
  const now = new Date();
  const transitions: StaleSessionTransition[] = [];

  // 1. Find sessions stuck in "started" for >5 minutes
  const startedCutoff = new Date(now.getTime() - STALLED_THRESHOLD_MS);
  const stuckStarted = await db
    .select({ id: agentSessions.id, startedAt: agentSessions.startedAt })
    .from(agentSessions)
    .where(
      sql`${agentSessions.status} = 'started' AND ${agentSessions.startedAt} < ${startedCutoff.toISOString()}`,
    );

  for (const session of stuckStarted) {
    const duration = Math.round(
      (now.getTime() - new Date(session.startedAt).getTime()) / 60000,
    );
    await db
      .update(agentSessions)
      .set({
        status: "stalled",
        error: `Session stalled: stuck in "started" for ${duration} minutes with no agent execution detected`,
        updatedAt: now,
      } as any)
      .where(eq(agentSessions.id, session.id));

    transitions.push({
      id: session.id,
      from: "started",
      to: "stalled",
      reason: `Stuck in "started" for ${duration}min`,
    });
    console.warn(
      `[session-store] ⚠️ Stalled session ${session.id.slice(0, 12)}... (${duration}min)`,
    );
  }

  // 2. Find sessions stuck in "stalled" for >30 minutes
  const stalledCutoff = new Date(now.getTime() - FAILED_THRESHOLD_MS);
  const stuckStalled = await db
    .select({ id: agentSessions.id, startedAt: agentSessions.startedAt, updatedAt: agentSessions.updatedAt })
    .from(agentSessions)
    .where(
      sql`${agentSessions.status} = 'stalled' AND ${agentSessions.updatedAt} < ${stalledCutoff.toISOString()}`,
    );

  for (const session of stuckStalled) {
    const duration = Math.round(
      (now.getTime() - new Date(session.startedAt).getTime()) / 60000,
    );
    await db
      .update(agentSessions)
      .set({
        status: "failed",
        error: `Session failed: stalled for >30min (total ${duration}min since start) — no agent execution detected`,
        completedAt: now,
        updatedAt: now,
      } as any)
      .where(eq(agentSessions.id, session.id));

    transitions.push({
      id: session.id,
      from: "stalled",
      to: "failed",
      reason: `Stalled >30min (total ${duration}min)`,
    });
    console.error(
      `[session-store] ❌ Failed session ${session.id.slice(0, 12)}... (${duration}min total)`,
    );
  }

  return transitions;
}

/**
 * Backfill all currently stuck sessions.
 * Used during Phase 3 deployment to fix the 14 stuck sessions.
 * Sessions stuck in "started" get marked as "failed" directly
 * (they've been stuck much longer than 30 minutes).
 */
export async function backfillStuckSessions(): Promise<{
  backfilled: number;
  details: string[];
}> {
  const now = new Date();
  const startedCutoff = new Date(now.getTime() - STALLED_THRESHOLD_MS);

  const stuck = await db
    .select({
      id: agentSessions.id,
      startedAt: agentSessions.startedAt,
      status: agentSessions.status,
    })
    .from(agentSessions)
    .where(
      sql`${agentSessions.status} IN ('started', 'running') AND ${agentSessions.startedAt} < ${startedCutoff.toISOString()}`,
    );

  const details: string[] = [];
  for (const session of stuck) {
    const duration = Math.round(
      (now.getTime() - new Date(session.startedAt).getTime()) / 60000,
    );
    await db
      .update(agentSessions)
      .set({
        status: "failed",
        error: `Session failed: was stuck in "${session.status}" for ${duration} minutes with no agent execution — backfilled during Phase 3 lifecycle fix`,
        completedAt: now,
        updatedAt: now,
      } as any)
      .where(eq(agentSessions.id, session.id));

    details.push(
      `${session.id.slice(0, 12)}... (was "${session.status}", ${duration}min)`,
    );
  }

  console.log(
    `[session-store] 🔧 Backfilled ${stuck.length} stuck sessions: ${details.join("; ")}`,
  );

  return { backfilled: stuck.length, details };
}

// ── Auth Helpers ───────────────────────────────────────────────────────────

const NEPTUNE_INTERNAL_TOKEN = process.env.NEPTUNE_INTERNAL_TOKEN;

export function validateProgrammaticAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;

  const token = authHeader.slice(7);
  if (!NEPTUNE_INTERNAL_TOKEN) return false;

  return token === NEPTUNE_INTERNAL_TOKEN;
}
