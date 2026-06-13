/**
 * GitHub Create Repository Endpoint (C.3 — RE-ENABLED)
 *
 * Creates a new GitHub repository using the user's OAuth token via Octokit.
 * Previously returning 501 (deliberately disabled); now fully implemented.
 *
 * POST: Create a new repository
 *   Body: { name: string, description?: string, private?: boolean, org?: string,
 *           autoInit?: boolean, gitignoreTemplate?: string, licenseTemplate?: string }
 *   Auth: Bearer NEPTUNE_TEST_TOKEN OR session cookie
 *   Response: { repoUrl, cloneUrl, sshUrl, htmlUrl, defaultBranch, name, fullName }
 */

import { checkBotProtection } from "@/lib/botid";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getUserGitHubToken } from "@/lib/github/token";
import { getServerSession } from "@/lib/session/get-server-session";

// Allow up to 60 seconds for GitHub API calls
export const maxDuration = 60;

interface CreateRepoRequest {
  name: string;
  description?: string;
  private?: boolean;
  org?: string;
  autoInit?: boolean;
  gitignoreTemplate?: string;
  licenseTemplate?: string;
}

/**
 * Validate the NEPTUNE_TEST_TOKEN bearer auth for programmatic access.
 */
function isProgrammaticAuth(req: Request): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const bearerToken = authHeader.slice(7);
  const expectedToken = process.env.NEPTUNE_TEST_TOKEN;
  const e2eToken = process.env.NEPTUNE_E2E_TEST_TOKEN;
  if (expectedToken && bearerToken === expectedToken) return true;
  if (e2eToken && bearerToken === e2eToken) return true;
  return false;
}

function isValidRepoName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{1,100}$/.test(name);
}

export async function POST(req: Request) {
  // 1. Validate session — cookie OR programmatic bearer token
  const session = await getServerSession();
  const isAuthorized = !!session?.user || isProgrammaticAuth(req);
  if (!isAuthorized) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const botVerification = await checkBotProtection();
  if (botVerification.isBot) {
    return Response.json({ error: "Access denied" }, { status: 403 });
  }

  // 2. Parse request
  let body: CreateRepoRequest;
  try {
    body = (await req.json()) as CreateRepoRequest;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name, description, private: isPrivate, org, autoInit, gitignoreTemplate, licenseTemplate } = body;

  // 3. Validate repo name
  if (!name || typeof name !== "string" || !isValidRepoName(name)) {
    return Response.json(
      { error: "Invalid repository name. Must be 1-100 chars, alphanumeric, dots, hyphens, or underscores." },
      { status: 400 },
    );
  }

  // 4. Rate limit — 10 repo creates per minute per user
  const userId = session?.user?.id ?? "programmatic";
  if (session?.user?.id) {
    const limited = await checkRateLimit({
      key: rateLimitKey(["github-create-repo", session.user.id]),
      limit: 10,
      windowMs: 60_000,
    });
    if (limited) return limited;
  }

  // 5. Get GitHub token
  const githubToken = session?.user?.id
    ? await getUserGitHubToken(session.user.id)
    : null;

  if (!githubToken) {
    return Response.json(
      { error: "GitHub account not connected. Connect GitHub to create repositories." },
      { status: 403 },
    );
  }

  // 6. Create the repository via GitHub REST API
  try {
    // Determine the correct endpoint: /user/repos (personal) or /orgs/:org/repos (organization)
    const endpoint = org
      ? `https://api.github.com/orgs/${encodeURIComponent(org)}/repos`
      : "https://api.github.com/user/repos";

    const payload: Record<string, unknown> = {
      name,
      description: description ?? "",
      private: isPrivate ?? false,
      auto_init: autoInit ?? true,
    };

    if (gitignoreTemplate) payload.gitignore_template = gitignoreTemplate;
    if (licenseTemplate) payload.license_template = licenseTemplate;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      const ghMessage =
        typeof data === "object" && data !== null && "message" in data
          ? String((data as Record<string, unknown>).message)
          : `GitHub API returned ${response.status}`;

      console.error(
        `[github-create-repo] Failed to create repo "${name}" for user ${userId}: ${ghMessage}`,
      );

      // Handle specific errors
      if (response.status === 422) {
        return Response.json(
          { error: `Repository "${name}" already exists or name is invalid. ${ghMessage}` },
          { status: 409 },
        );
      }

      if (response.status === 404 && org) {
        return Response.json(
          { error: `Organization "${org}" not found or you don't have access.` },
          { status: 404 },
        );
      }

      return Response.json(
        { error: `Failed to create repository: ${ghMessage}` },
        { status: response.status as number },
      );
    }

    // 7. Return the created repo details
    const repoData = data as Record<string, unknown>;
    const result = {
      name: repoData.name as string,
      fullName: repoData.full_name as string,
      repoUrl: repoData.clone_url as string,
      cloneUrl: repoData.clone_url as string,
      sshUrl: repoData.ssh_url as string,
      htmlUrl: repoData.html_url as string,
      defaultBranch: repoData.default_branch as string,
      private: (repoData.private as boolean) ?? false,
      description: (repoData.description as string) ?? null,
      createdAt: repoData.created_at as string,
    };

    console.log(
      `[github-create-repo] Created repo "${result.fullName}" for user ${userId}`,
    );

    return Response.json(result, { status: 201 });
  } catch (error) {
    console.error("[github-create-repo] Unexpected error:", error);
    return Response.json(
      {
        error: error instanceof Error
          ? `Failed to create repository: ${error.message}`
          : "Failed to create repository",
      },
      { status: 500 },
    );
  }
}
