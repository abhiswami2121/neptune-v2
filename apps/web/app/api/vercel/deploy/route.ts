/**
 * Vercel Deploy Endpoint — C.11
 *
 * Triggers or retrieves the latest Vercel deployment for a project.
 * Uses Vercel REST API only (no @vercel/sdk dependency needed).
 *
 * POST: Trigger/find deployment
 *   Body: { projectIdOrName: string, teamId?: string, branch?: string, target?: string }
 *   Auth: Bearer NEPTUNE_TEST_TOKEN OR session cookie
 *   Response: { deployment: { url, inspectorUrl, state, readyState, created } }
 *
 * GET: List latest deployments for a project
 *   Query: projectIdOrName, teamId?, branch?, limit?
 *   Auth: Bearer NEPTUNE_TEST_TOKEN OR session cookie
 *   Response: { deployments: [...] }
 */

import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getServerSession } from "@/lib/session/get-server-session";
import {
  VercelApiError,
  isVercelInvalidTokenError,
  findLatestPreviewDeploymentUrlForBranch,
  findLatestBuildingDeploymentUrlForBranch,
  findLatestFailedDeploymentInspectorUrlForBranch,
} from "@/lib/vercel/projects";
import { getUserVercelToken } from "@/lib/vercel/token";

const VERCEL_API_BASE_URL = "https://api.vercel.com";

// Allow up to 60 seconds for Vercel API calls
export const maxDuration = 60;

interface VercelDeployment {
  uid: string;
  url: string;
  inspectorUrl: string | null;
  state?: string;
  readyState?: string;
  ready?: number;
  createdAt?: number;
  created?: number;
  target?: string | null;
  meta?: Record<string, unknown>;
}

interface VercelDeploymentsResponse {
  deployments?: VercelDeployment[];
}

interface DeployRequestBody {
  projectIdOrName: string;
  teamId?: string;
  branch?: string;
  target?: string;
}

/**
 * Validate the NEPTUNE_TEST_TOKEN bearer auth for programmatic access.
 */
function isProgrammaticAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const bearerToken = authHeader.slice(7);
  const candidates = [
    process.env.NEPTUNE_INTERNAL_TOKEN,
    process.env.NEPTUNE_TEST_TOKEN,
    process.env.NEPTUNE_E2E_TEST_TOKEN,
  ];
  return candidates.some((expected) => !!(expected && bearerToken === expected));
}

async function fetchVercelDeployments(params: {
  token: string;
  projectIdOrName: string;
  teamId?: string | null;
  branch?: string;
  state?: string;
  limit?: number;
  target?: string;
}): Promise<VercelDeployment[]> {
  const query = new URLSearchParams();
  query.set("projectId", params.projectIdOrName);
  if (params.teamId) query.set("teamId", params.teamId);
  if (params.branch) query.set("branch", params.branch);
  if (params.state) query.set("state", params.state);
  if (params.target) query.set("target", params.target);
  query.set("limit", String(params.limit ?? 10));

  const url = new URL(`${VERCEL_API_BASE_URL}/v6/deployments`);
  url.search = query.toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${params.token}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new VercelApiError({
      status: response.status,
      details: body || null,
      invalidToken: response.status === 401,
    });
  }

  const data = (await response.json()) as VercelDeploymentsResponse;
  return data.deployments ?? [];
}

function getDeploymentDisplayUrl(deployment: VercelDeployment): string | null {
  const rawUrl = deployment.url?.trim();
  if (!rawUrl) return null;
  return /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
}

function getDeploymentTimestamp(deployment: VercelDeployment): number {
  const ts =
    deployment.ready ??
    deployment.createdAt ??
    deployment.created;
  return typeof ts === "number" && Number.isFinite(ts) ? ts : 0;
}

export async function POST(req: Request) {
  // Auth: session cookie OR programmatic bearer token
  const session = await getServerSession();
  const isAuthorized = !!session?.user || isProgrammaticAuth(req);
  if (!isAuthorized) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  // Parse body
  let body: DeployRequestBody;
  try {
    body = (await req.json()) as DeployRequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectIdOrName, teamId, branch, target } = body;

  if (!projectIdOrName || typeof projectIdOrName !== "string") {
    return Response.json(
      { error: "projectIdOrName (string) is required" },
      { status: 400 },
    );
  }

  // Rate limit on deploy lookups
  const userId = session?.user?.id ?? "programmatic";
  if (session?.user?.id) {
    const limited = await checkRateLimit({
      key: rateLimitKey(["vercel-deploy", session.user.id]),
      limit: 30,
      windowMs: 60_000,
    });
    if (limited) return limited;
  }

  // Get Vercel token
  const token = session?.user?.id
    ? await getUserVercelToken(session.user.id)
    : null;

  if (!token) {
    return Response.json(
      { error: "Vercel account not connected. Connect Vercel to deploy." },
      { status: 403 },
    );
  }

  try {
    // Fetch latest deployments matching the criteria
    const deployments = await fetchVercelDeployments({
      token,
      projectIdOrName,
      teamId: teamId ?? null,
      branch,
      target: target ?? undefined,
      limit: 5,
    });

    if (deployments.length === 0) {
      // Also try with branch-specific lookup
      let previewUrl: string | null = null;
      let buildingUrl: string | null = null;
      let failedInspectorUrl: string | null = null;

      if (branch) {
        const [preview, building, failed] = await Promise.all([
          findLatestPreviewDeploymentUrlForBranch({
            token,
            projectIdOrName,
            branch,
            teamId: teamId ?? null,
          }).catch(() => null),
          findLatestBuildingDeploymentUrlForBranch({
            token,
            projectIdOrName,
            branch,
            teamId: teamId ?? null,
          }).catch(() => null),
          findLatestFailedDeploymentInspectorUrlForBranch({
            token,
            projectIdOrName,
            branch,
            teamId: teamId ?? null,
          }).catch(() => null),
        ]);
        previewUrl = preview;
        buildingUrl = building;
        failedInspectorUrl = failed;
      }

      return Response.json({
        deployments: [],
        message: "No deployments found for this project/branch. If the project is Git-connected, push to trigger an auto-deploy.",
        previewUrl,
        buildingUrl,
        failedInspectorUrl,
      });
    }

    // Map to clean response
    const mapped = deployments.map((d) => ({
      url: getDeploymentDisplayUrl(d),
      inspectorUrl: d.inspectorUrl ?? null,
      state: d.state ?? d.readyState ?? "UNKNOWN",
      readyState: d.readyState ?? d.state ?? "UNKNOWN",
      target: d.target ?? null,
      createdAt: getDeploymentTimestamp(d),
      uid: d.uid,
    }));

    // Sort: READY first, then by recency
    mapped.sort((a, b) => {
      if (a.readyState === "READY" && b.readyState !== "READY") return -1;
      if (a.readyState !== "READY" && b.readyState === "READY") return 1;
      return b.createdAt - a.createdAt;
    });

    return Response.json({
      deployments: mapped,
      latest: mapped[0] ?? null,
    });
  } catch (error) {
    if (isVercelInvalidTokenError(error)) {
      console.warn(
        `Vercel token invalid for user ${userId}; reconnect required.`,
      );
      return Response.json(
        { error: "Reconnect Vercel to deploy" },
        { status: 403 },
      );
    }

    const err = error as Error;
    console.error("Vercel deploy error:", err);
    return Response.json(
      {
        error: error instanceof VercelApiError
          ? `Vercel API error: ${err.message}`
          : "Failed to fetch Vercel deployments",
      },
      { status: 500 },
    );
  }
}

/**
 * GET handler for listing deployments without POST body requirement.
 * Useful for quick status checks.
 */
export async function GET(req: Request) {
  const session = await getServerSession();
  const isAuthorized = !!session?.user || isProgrammaticAuth(req);
  if (!isAuthorized) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectIdOrName = searchParams.get("projectIdOrName");
  const teamId = searchParams.get("teamId");
  const branch = searchParams.get("branch");

  if (!projectIdOrName) {
    return Response.json(
      { error: "projectIdOrName query parameter is required" },
      { status: 400 },
    );
  }

  const token = session?.user?.id
    ? await getUserVercelToken(session.user.id)
    : null;

  if (!token) {
    return Response.json(
      { error: "Vercel account not connected" },
      { status: 403 },
    );
  }

  try {
    const deployments = await fetchVercelDeployments({
      token,
      projectIdOrName,
      teamId: teamId ?? null,
      branch: branch ?? undefined,
      limit: 10,
    });

    return Response.json({
      deployments: deployments.map((d) => ({
        url: getDeploymentDisplayUrl(d),
        inspectorUrl: d.inspectorUrl ?? null,
        state: d.state ?? d.readyState ?? "UNKNOWN",
        readyState: d.readyState ?? d.state ?? "UNKNOWN",
        createdAt: getDeploymentTimestamp(d),
        uid: d.uid,
      })),
    });
  } catch (error) {
    console.error("Vercel deploy GET error:", error);
    return Response.json(
      { error: "Failed to fetch Vercel deployments" },
      { status: 500 },
    );
  }
}
