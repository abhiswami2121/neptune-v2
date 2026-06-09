/**
 * Agent Memory — cross-session context persistence for V2 coding agent.
 *
 * Stores facts about user preferences, decisions, code patterns, and gotchas
 * across sessions so V2 remembers what it learned.
 *
 * Module exports:
 * - rememberFact: Store a learned fact
 * - recallRelevantFacts: Semantic recall based on current task context
 * - summarizeSession: Summarize learnings from a completed session
 */

import { db } from "@/lib/db/client";
import { codingAgentMemory, type CodingAgentMemory, type NewCodingAgentMemory } from "@/lib/db/schema";
import { asc, desc, eq, and, sql } from "drizzle-orm";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FactType = "preference" | "decision" | "pattern" | "gotcha";

export interface Fact {
  id: string;
  userId: string;
  repo: string;
  sessionId: string;
  factType: FactType;
  fact: string;
  createdAt: Date;
  lastAccessedAt: Date;
}

export interface SessionSummary {
  facts: Array<Pick<Fact, "factType" | "fact">>;
  totalFacts: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_FACTS_PER_RECALL = 10;
const FACT_EXPIRY_DAYS = 90; // Facts older than 90 days are excluded from recall

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateFactId(): string {
  return `fact_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function simpleKeywordScore(fact: string, query: string): number {
  const factLower = fact.toLowerCase();
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/[\s,;.?!]+/).filter((w) => w.length > 2);

  let score = 0;
  for (const word of queryWords) {
    if (factLower.includes(word)) {
      score += 10;
    }
  }

  // Bonus: exact phrase match
  if (factLower.includes(queryLower)) {
    score += 30;
  }

  return Math.min(score, 100);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Persist a fact learned during a V2 coding session.
 *
 * @example
 * await rememberFact("user_123", "abhiswami2121/neptune-v2", "preference",
 *   "User prefers squash merges")
 * await rememberFact("user_123", "abhiswami2121/neptune-v2", "gotcha",
 *   "Drizzle migrations require manual journal.json update")
 */
export async function rememberFact(
  userId: string,
  repo: string,
  factType: FactType,
  fact: string,
  sessionId?: string,
): Promise<Fact> {
  const id = generateFactId();
  const now = new Date();

  const newFact: NewCodingAgentMemory = {
    id,
    userId,
    repo,
    sessionId: sessionId ?? "",
    factType,
    fact,
    embedding: null, // Vector embedding generated async or via external pipeline
    createdAt: now,
    lastAccessedAt: now,
  };

  await db.insert(codingAgentMemory).values(newFact);

  return {
    id,
    userId,
    repo,
    sessionId: sessionId ?? "",
    factType,
    fact,
    createdAt: now,
    lastAccessedAt: now,
  };
}

/**
 * Recall facts relevant to the current user's task.
 *
 * Uses keyword matching (with optional embedding similarity when available).
 * Returns up to MAX_FACTS_PER_RECALL facts sorted by relevance.
 *
 * @example
 * const facts = await recallRelevantFacts("user_123", "abhiswami2121/neptune-v2",
 *   "deploy a new settings page with model preference toggle")
 */
export async function recallRelevantFacts(
  userId: string,
  repo: string,
  currentPrompt: string,
): Promise<Fact[]> {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - FACT_EXPIRY_DAYS);

  // Fetch recent facts for this user + repo
  const rows = await db
    .select()
    .from(codingAgentMemory)
    .where(
      and(
        eq(codingAgentMemory.userId, userId),
        eq(codingAgentMemory.repo, repo),
        sql`${codingAgentMemory.createdAt} > ${expiryDate.toISOString()}`,
      ),
    )
    .orderBy(desc(codingAgentMemory.lastAccessedAt))
    .limit(50); // Fetch pool then score

  // Score each fact against the current prompt
  const scored = rows.map((row) => ({
    ...row,
    score: simpleKeywordScore(row.fact, currentPrompt),
  }));

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);

  const topFacts = scored
    .filter((f) => f.score > 0)
    .slice(0, MAX_FACTS_PER_RECALL);

  // Update lastAccessedAt for recalled facts
  if (topFacts.length > 0) {
    await db
      .update(codingAgentMemory)
      .set({ lastAccessedAt: new Date() })
      .where(
        and(
          eq(codingAgentMemory.userId, userId),
          eq(codingAgentMemory.repo, repo),
        ),
      );
  }

  return topFacts.map((f) => ({
    id: f.id,
    userId: f.userId,
    repo: f.repo,
    sessionId: f.sessionId,
    factType: f.factType as FactType,
    fact: f.fact,
    createdAt: f.createdAt,
    lastAccessedAt: f.lastAccessedAt,
  }));
}

/**
 * Summarize learnings from a completed session.
 *
 * Called at the end of every V2 sandbox session. Extracts key facts:
 * - Preferences: user choices made during the session
 * - Decisions: architectural or implementation decisions
 * - Patterns: code patterns that worked well
 * - Gotchas: pitfalls or errors to avoid
 *
 * @returns Summary of extracted facts
 */
export async function summarizeSession(
  userId: string,
  sessionId: string,
  repo: string,
  messages: Array<{ role: string; content: string }>,
): Promise<SessionSummary> {
  const facts: Array<Pick<Fact, "factType" | "fact">> = [];

  // Extract facts from the session messages using simple heuristics

  const userMessages = messages.filter((m) => m.role === "user");
  const assistantMessages = messages.filter((m) => m.role === "assistant");

  // 1. Detect preferences from user messages
  for (const msg of userMessages) {
    const text = msg.content.toLowerCase();

    // Preference indicators
    if (/(?:prefer|like|want|always|never)\s+(?:to\s+)?(?:use|have|see)/i.test(text)) {
      facts.push({
        factType: "preference",
        fact: `User stated: "${msg.content.slice(0, 200)}"`,
      });
    }

    // Decision indicators
    if (/(?:let's|we should|go with|choose|pick)\s+/i.test(text)) {
      facts.push({
        factType: "decision",
        fact: `Decision made: "${msg.content.slice(0, 200)}"`,
      });
    }
  }

  // 2. Detect patterns and gotchas from assistant messages
  for (const msg of assistantMessages) {
    const text = msg.content;

    // Pattern indicators: successful implementations
    if (/(?:pattern|best practice|convention|standard|idiom)/i.test(text)) {
      facts.push({
        factType: "pattern",
        fact: `Pattern identified: "${text.slice(0, 200)}"`,
      });
    }

    // Gotcha indicators: errors or pitfalls
    if (/(?:error|bug|cannot|failed|issue|gotcha|watch out|careful|don't|avoid)/i.test(text)) {
      facts.push({
        factType: "gotcha",
        fact: `Gotcha: "${text.slice(0, 200)}"`,
      });
    }
  }

  // Persist extracted facts
  let totalFacts = 0;
  for (const fact of facts) {
    try {
      await rememberFact(userId, repo, fact.factType, fact.fact, sessionId);
      totalFacts++;
    } catch (err) {
      console.warn(`[agent-memory] Failed to persist fact: ${fact.factType}`, err);
    }
  }

  return { facts, totalFacts };
}

/**
 * Build a context string from recalled facts for system prompt injection.
 */
export function buildMemoryContext(facts: Fact[]): string {
  if (facts.length === 0) return "";

  const sections: Record<FactType, string[]> = {
    preference: [],
    decision: [],
    pattern: [],
    gotcha: [],
  };

  for (const fact of facts) {
    sections[fact.factType].push(`- ${fact.fact}`);
  }

  const parts: string[] = [];

  if (sections.preference.length > 0) {
    parts.push(`User Preferences:\n${sections.preference.join("\n")}`);
  }
  if (sections.decision.length > 0) {
    parts.push(`Past Decisions:\n${sections.decision.join("\n")}`);
  }
  if (sections.pattern.length > 0) {
    parts.push(`Known Patterns:\n${sections.pattern.join("\n")}`);
  }
  if (sections.gotcha.length > 0) {
    parts.push(`Gotchas to Avoid:\n${sections.gotcha.join("\n")}`);
  }

  if (parts.length === 0) return "";

  return `\n## Context From Previous Sessions\n${parts.join("\n\n")}\n`;
}

/**
 * Clean up old facts beyond the expiry window.
 * Should be called periodically (e.g., via cron or session cleanup).
 */
export async function cleanupExpiredFacts(): Promise<number> {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() - FACT_EXPIRY_DAYS);

  const result = await db
    .delete(codingAgentMemory)
    .where(
      sql`${codingAgentMemory.createdAt} < ${expiryDate.toISOString()}`,
    );

  return result.rowCount ?? 0;
}
