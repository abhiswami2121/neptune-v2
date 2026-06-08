import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  fetchSingleInstallation,
  syncUserInstallations,
} from "@/lib/github/sync";
import { getUserGitHubToken } from "@/lib/github/token";
import { getGitHubUsername } from "@/lib/github/users";
import { isManagedTemplateTrialUser } from "@/lib/managed-template-trial";
import { sanitizeInternalRedirect } from "@/lib/redirect-safety";
import { getServerSession } from "@/lib/session/get-server-session";
import { upsertInstallation } from "@/lib/db/installations";

function parseInstallationId(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const installationId = Number.parseInt(value, 10);
  if (!Number.isFinite(installationId)) {
    return null;
  }

  return installationId;
}

function redirectAndClearCookies(url: string | URL): NextResponse {
  const response = NextResponse.redirect(url);
  response.cookies.delete("github_app_install_redirect_to");
  response.cookies.delete("github_app_install_state");
  response.cookies.delete("github_reconnect");
  return response;
}

/**
 * GitHub App Setup URL callback — handles installation sync only.
 * OAuth token exchange is handled by better-auth at /api/auth/callback/github.
 */
export async function GET(req: Request): Promise<Response> {
  const cookieStore = await cookies();
  const redirectTo = sanitizeInternalRedirect(
    cookieStore.get("github_app_install_redirect_to")?.value,
    "/get-started",
    req.url,
  );

  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const redirectUrl = new URL(redirectTo, req.url);

  if (isManagedTemplateTrialUser(session, req.url)) {
    redirectUrl.searchParams.set("github", "trial_blocked");
    return redirectAndClearCookies(redirectUrl);
  }

  const requestUrl = new URL(req.url);
  const installationId = parseInstallationId(
    requestUrl.searchParams.get("installation_id"),
  );
  const setupAction = requestUrl.searchParams.get("setup_action");

  // get the user's github token from better-auth
  const token = await getUserGitHubToken(session.user.id);
  if (!token) {
    redirectUrl.searchParams.set("github", "not_linked");
    return redirectAndClearCookies(redirectUrl);
  }

  // sync installations via the user installations list endpoint
  let syncedInstallationsCount: number | null = null;
  const username = await getGitHubUsername(session.user.id);

  if (username) {
    try {
      syncedInstallationsCount = await syncUserInstallations(
        session.user.id,
        token,
        username,
      );
    } catch (error) {
      console.error("Failed syncing installations:", error);
    }
  }

  // FALLBACK: when the list endpoint returns 0 (eventual-consistency race
  // after a fresh install) but we have a concrete installation_id from the
  // callback, fetch the single installation directly and persist it.
  let fallbackInstallationSaved = false;
  if ((syncedInstallationsCount ?? 0) === 0 && installationId) {
    try {
      const single = await fetchSingleInstallation(token, installationId);
      if (single) {
        await upsertInstallation({
          userId: session.user.id,
          installationId,
          accountLogin: single.accountLogin,
          accountType: single.accountType,
          repositorySelection: single.repositorySelection,
          installationUrl: single.installationUrl,
        });
        syncedInstallationsCount = 1;
        fallbackInstallationSaved = true;
      }
    } catch (error) {
      console.error(
        "Failed fallback single-installation fetch for installation",
        installationId,
        ":",
        error,
      );
    }
  }

  let githubStatus: string;
  if (setupAction === "request") {
    githubStatus = "request_sent";
  } else if ((syncedInstallationsCount ?? 0) > 0) {
    githubStatus = "app_installed";
    if (fallbackInstallationSaved) {
      redirectUrl.searchParams.set("fallback_sync", "1");
    }
  } else if (!installationId) {
    githubStatus = "no_action";
    redirectUrl.searchParams.set("missing_installation_id", "1");
  } else {
    // We have an installation_id but couldn't sync it via either API path.
    // Create a minimal installation record using just the callback params
    // so the onboarding gate passes.  The webhook or a later sync will fill
    // in the correct account details.
    githubStatus = "app_installed";
    redirectUrl.searchParams.set("deferred_sync", "1");
    try {
      await upsertInstallation({
        userId: session.user.id,
        installationId,
        accountLogin: `pending-${installationId}`,
        accountType: "User",
        repositorySelection: "selected",
        installationUrl: null,
      });
    } catch (error) {
      console.error(
        "Failed to create deferred installation record for",
        installationId,
        ":",
        error,
      );
    }
  }

  redirectUrl.searchParams.set("github", githubStatus);
  return redirectAndClearCookies(redirectUrl);
}
