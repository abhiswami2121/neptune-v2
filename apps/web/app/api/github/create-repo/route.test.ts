import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

type AuthSession = {
  user: {
    id: string;
    name?: string | null;
    username?: string;
  };
} | null;

let authSession: AuthSession;
let mockGithubToken: string | null = "gh_test_token_123";
let mockVercelToken: string | null = null;
let mockBotCheck: boolean = false;

mock.module("@/lib/session/get-server-session", () => ({
  getServerSession: async () => authSession,
}));

mock.module("@/lib/github/token", () => ({
  getUserGitHubToken: async (_userId: string) => mockGithubToken,
}));

mock.module("@/lib/botid", () => ({
  checkBotProtection: async () => ({ isBot: mockBotCheck }),
}));

mock.module("@/lib/rate-limit", () => ({
  checkRateLimit: async () => null,
  rateLimitKey: (parts: string[]) => parts.join(":"),
}));

const routeModulePromise = import("./route");

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/github/create-repo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/github/create-repo (re-enabled)", () => {
  beforeEach(() => {
    authSession = {
      user: {
        id: "user-1",
        name: "Test User",
        username: "testuser",
      },
    };
    mockGithubToken = "gh_test_token_123";
    mockBotCheck = false;
  });

  test("returns 401 when unauthenticated and no bearer token", async () => {
    authSession = null;
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/github/create-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "test-repo" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Not authenticated" });
  });

  test("returns 400 for invalid JSON", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(
      new Request("http://localhost/api/github/create-repo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid JSON body" });
  });

  test("returns 400 when repo name is missing", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(createRequest({ description: "A test repo" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid repository name");
  });

  test("returns 400 when repo name is invalid", async () => {
    const { POST } = await routeModulePromise;

    const response = await POST(createRequest({ name: "bad name with spaces!" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("Invalid repository name");
  });

  test("returns 403 when GitHub token is not available", async () => {
    mockGithubToken = null;
    const { POST } = await routeModulePromise;

    const response = await POST(createRequest({ name: "test-repo" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "GitHub account not connected. Connect GitHub to create repositories.",
    });
  });

  test("returns 403 when bot is detected", async () => {
    mockBotCheck = true;
    const { POST } = await routeModulePromise;

    const response = await POST(createRequest({ name: "test-repo" }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Access denied" });
  });

  // NOTE: The actual GitHub API call is tested via integration/smoke tests
  // because it requires a real GitHub token. The unit tests cover auth, validation,
  // and error handling paths.
});
