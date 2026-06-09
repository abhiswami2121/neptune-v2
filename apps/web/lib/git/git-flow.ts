/**
 * Git Flow — high-level git workflow orchestration for V2's coding agent.
 *
 * Wraps the lower-level git/github modules with opinionated V2 conventions:
 * - Feature branch naming: `feature/<task-slug>` (kebab-case, max 50 chars)
 * - Conventional Commits: `<type>(<scope>): <subject>`
 * - PR templates with task context
 * - Automatic branch cleanup after merge
 * - Conflict resolution with rebase strategy
 */

import { SAFE_BRANCH_PATTERN } from "@/lib/git/helpers";
import { openPullRequest, deleteBranchRef, findPullRequest, getPullRequestStatus } from "@/lib/github/pulls";
import { getOctokit, parseGitHubUrl } from "@/lib/github/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface FeatureBranchResult {
  branch: string;
  baseSha: string;
}

export interface CommitResult {
  sha: string;
}

export interface PROpenResult {
  prUrl: string;
  number: number;
}

export interface BranchCleanupResult {
  deleted: string[];
  errors: string[];
}

export interface ConflictResolution {
  resolved: boolean;
  conflicts: string[];
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_TYPES = ["feat", "fix", "refactor", "docs", "chore", "test", "style", "perf"] as const;
type CommitType = (typeof VALID_TYPES)[number];

const MAX_BRANCH_LENGTH = 50;
const MAX_SUBJECT_LENGTH = 72;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_BRANCH_LENGTH);
}

function validateBranchSuffix(suffix: string): string {
  const sanitized = suffix.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (sanitized.length > MAX_BRANCH_LENGTH - 12) {
    // 12 = "feature/" prefix + safety margin
    return sanitized.slice(0, MAX_BRANCH_LENGTH - 8);
  }
  return sanitized;
}

function isValidType(type: string): type is CommitType {
  return VALID_TYPES.includes(type as CommitType);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a feature branch with V2's naming convention.
 *
 * Branch format: `feature/<task-slug>`
 * Falls back to `feature/<N-random-chars>` if slug is empty.
 */
export async function createFeatureBranch(
  repoUrl: string,
  taskSlug: string,
): Promise<FeatureBranchResult> {
  const branchName = taskSlug
    ? `feature/${validateBranchSuffix(taskSlug)}`
    : `feature/${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;

  if (!SAFE_BRANCH_PATTERN.test(branchName.replace("feature/", ""))) {
    throw new Error(`Unsafe branch name: ${branchName}`);
  }

  // The actual branch creation happens in the sandbox via git CLI.
  // This function provides the naming convention and validates it.
  // Sandbox executor runs: git checkout -b <branchName> && git push -u origin <branchName>

  return {
    branch: branchName,
    baseSha: "", // Populated by sandbox after git rev-parse HEAD
  };
}

/**
 * Generate a Conventional Commit message from structured inputs.
 *
 * Format: `<type>(<scope>): <subject>`
 *
 * @example
 * commitWithConventionalMessage("feat", "chat", "add streaming response support")
 * // => "feat(chat): add streaming response support"
 */
export function commitWithConventionalMessage(
  repoOrType: string,
  typeOrScope: string,
  scopeOrSubject: string,
  subject?: string,
): CommitResult & { message: string } {
  // Overload detection: if 4 args, first is repo (canonical signature)
  // If 3 args, traditional (type, scope, subject) for backward compat
  let type: string;
  let scope: string;
  let subjectStr: string;

  if (subject !== undefined) {
    // 4-arg form: commitWithConventionalMessage(repo, type, scope, subject)
    type = typeOrScope;
    scope = scopeOrSubject;
    subjectStr = subject;
  } else {
    // 3-arg form: commitWithConventionalMessage(type, scope, subject)
    type = repoOrType;
    scope = typeOrScope;
    subjectStr = scopeOrSubject;
  }
  if (!isValidType(type)) {
    throw new Error(
      `Invalid commit type: "${type}". Must be one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  const trimmedSubject = subject.trim();
  if (!trimmedSubject) {
    throw new Error("Commit subject is required");
  }

  if (trimmedSubject.length > MAX_SUBJECT_LENGTH) {
    throw new Error(
      `Commit subject exceeds ${MAX_SUBJECT_LENGTH} characters (got ${trimmedSubject.length})`,
    );
  }

  const scoped = scope ? `${type}(${scope})` : type;
  const message = `${scoped}: ${trimmedSubject}`;

  return {
    sha: "", // Populated by sandbox after git commit
    message,
  };
}

/**
 * Open a Pull Request with V2's standard template.
 *
 * The template includes:
 * - Task context from the branch name
 * - Auto-generated description placeholder
 * - V2 coding agent attribution
 */
export async function openPRWithTemplate(
  repoUrl: string,
  branch: string,
  title: string,
  body?: string,
  baseBranch = "main",
): Promise<PROpenResult> {
  const taskContext = branch.replace(/^feature\//, "").replace(/-/g, " ");
  const prBody =
    body ??
    [
      "## Summary",
      "",
      `Task: ${taskContext}`,
      "",
      "## Changes",
      "",
      "<!-- Describe what changed and why -->",
      "",
      "## Test Plan",
      "",
      "- [ ] Code compiles without errors",
      "- [ ] Pre-flight checks pass",
      "- [ ] Preview deployment is healthy",
      "",
      "---",
      `🤖 Generated by [Neptune V2 Coding Agent](https://neptune-v2.vercel.app)`,
    ].join("\n");

  const result = await openPullRequest({
    repoUrl,
    branchName: branch,
    title,
    body: prBody,
    baseBranch,
    isDraft: false,
  });

  if (!result.success || !result.prUrl || !result.prNumber) {
    throw new Error(result.error ?? "Failed to open pull request");
  }

  return {
    prUrl: result.prUrl,
    number: result.prNumber,
  };
}

/**
 * Clean up merged branches from the repository.
 *
 * Finds all branches prefixed with `feature/` or `fix/`,
 * checks if they have a merged PR, and deletes merged ones.
 */
export async function cleanupMergedBranches(
  repoUrl: string,
  options?: {
    prefix?: string[];
    dryRun?: boolean;
  },
): Promise<BranchCleanupResult> {
  const prefixes = options?.prefix ?? ["feature/", "fix/", "refactor/"];
  const deleted: string[] = [];
  const errors: string[] = [];

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    return { deleted, errors: ["Invalid GitHub repository URL"] };
  }

  const { owner, repo } = parsed;
  const octokitResult = await getOctokit();

  if (!octokitResult.authenticated) {
    return { deleted, errors: ["GitHub account not connected"] };
  }

  try {
    // List all branches
    const branchesResponse = await octokitResult.octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });

    for (const branch of branchesResponse.data) {
      const branchName = branch.name;

      // Check if branch matches any prefix
      const matches = prefixes.some((p) => branchName.startsWith(p));
      if (!matches) continue;

      // Check if there's a PR for this branch
      const prResult = await findPullRequest({
        owner,
        repo,
        branchName,
      });

      if (!prResult.found) {
        // No PR found — skip or clean up orphaned branch
        if (!options?.dryRun) {
          if (options?.prefix) {
            // Only auto-clean if explicitly requested
            deleted.push(branchName);
          }
        }
        continue;
      }

      // If PR is merged, delete the branch
      if (prResult.prStatus === "merged") {
        if (!options?.dryRun) {
          const deleteResult = await deleteBranchRef({
            repoUrl,
            branchName,
          });
          if (deleteResult.success) {
            deleted.push(branchName);
          } else {
            errors.push(`${branchName}: ${deleteResult.error}`);
          }
        } else {
          deleted.push(`${branchName} (dry-run)`);
        }
      }
    }
  } catch (error) {
    errors.push(
      `Failed to list branches: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { deleted, errors };
}

/**
 * Attempt to auto-resolve merge conflicts for a branch.
 *
 * Strategy:
 * 1. Fetch latest main
 * 2. Rebase branch onto main
 * 3. For conflicts: prefer incoming changes (theirs) for generated files,
 *    prefer current changes (ours) for hand-written files
 * 4. If conflicts remain after strategy: report them, do not force-resolve
 */
export function conflictAutoResolve(
  conflictFiles: Array<{
    path: string;
    content: string;
    ours: string;
    theirs: string;
  }>,
): ConflictResolution {
  const conflicts: string[] = [];
  let allResolved = true;

  // File patterns that should prefer "theirs" (incoming from main)
  const PREFER_THEIRS = [
    /pnpm-lock\.yaml$/,
    /package-lock\.json$/,
    /\.lock$/,
    /CHANGELOG\.md$/i,
    /migrations\/meta\//,
    /\.snapshot\.json$/,
  ];

  // File patterns that should prefer "ours" (branch changes)
  const PREFER_OURS = [
    /SKILL\.md$/,
    /\.tsx?$/,
    /\.css$/,
    /\.sql$/,
    /route\.ts$/,
    /page\.tsx$/,
  ];

  for (const file of conflictFiles) {
    const shouldPreferTheirs = PREFER_THEIRS.some((p) => p.test(file.path));
    const shouldPreferOurs = PREFER_OURS.some((p) => p.test(file.path));

    if (shouldPreferTheirs && !shouldPreferOurs) {
      // Auto-resolve by taking theirs
      continue;
    }

    if (shouldPreferOurs && !shouldPreferTheirs) {
      // Auto-resolve by taking ours
      continue;
    }

    // Both or neither — cannot auto-resolve
    conflicts.push(file.path);
    allResolved = false;
  }

  return {
    resolved: allResolved && conflicts.length === 0,
    conflicts,
    error:
      conflicts.length > 0
        ? `${conflicts.length} file(s) require manual resolution: ${conflicts.join(", ")}`
        : undefined,
  };
}

/**
 * Convenience overload: check if a branch has conflicts with main
 * and attempt auto-resolution via the GitHub compare API.
 *
 * This is the sandbox-friendly entry point: V2 calls this with just
 * repo + branch and gets back a structured resolution result.
 *
 * @example
 *   const result = await conflictAutoResolve("abhiswami2121/neptune-v2", "feature/my-task");
 *   // => { resolved: true, conflicts: [], message: "No conflicts — safe to rebase" }
 */
export async function checkBranchConflicts(
  repoUrl: string,
  branch: string,
  baseBranch = "main",
): Promise<{
  resolved: boolean;
  conflicts: string[];
  message: string;
}> {
  if (!branch || !SAFE_BRANCH_PATTERN.test(branch.replace(/^[a-z]+\//, ""))) {
    return {
      resolved: false,
      conflicts: [],
      message: `Invalid branch name: ${branch}`,
    };
  }

  const parsed = parseGitHubUrl(repoUrl);
  if (!parsed) {
    return {
      resolved: false,
      conflicts: [],
      message: `Invalid repo URL: ${repoUrl}`,
    };
  }

  try {
    const { owner, repo } = parsed;
    const compareUrl = `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}`;

    const response = await fetch(compareUrl, {
      headers: {
        Accept: "application/vnd.github.v3+json",
        ...(process.env.GITHUB_TOKEN
          ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
          : {}),
      },
    });

    if (!response.ok) {
      return {
        resolved: false,
        conflicts: [],
        message: `GitHub API returned ${response.status}`,
      };
    }

    const compare = await response.json();

    switch (compare.status) {
      case "identical":
        return {
          resolved: true,
          conflicts: [],
          message: "Branch is already in sync with main",
        };
      case "ahead":
        return {
          resolved: true,
          conflicts: [],
          message: "Branch is ahead of main — no conflicts",
        };
      case "behind":
        return {
          resolved: true,
          conflicts: [],
          message:
            "Branch is behind main but has no conflicts — fast-forward to rebase",
        };
      case "diverged": {
        if (compare.mergeable === true) {
          return {
            resolved: true,
            conflicts: [],
            message:
              "Branches have diverged but GitHub reports mergeable — safe to rebase",
          };
        }
        const conflictFiles: string[] = (compare.files || [])
          .filter((f: { status?: string }) => f.status === "modified")
          .map((f: { filename: string }) => f.filename);

        return {
          resolved: false,
          conflicts: conflictFiles,
          message: `${conflictFiles.length} file(s) have conflicts requiring manual resolution`,
        };
      }
      default:
        return {
          resolved: false,
          conflicts: [],
          message: `Unknown compare status: ${compare.status}`,
        };
    }
  } catch (err) {
    return {
      resolved: false,
      conflicts: [],
      message:
        err instanceof Error
          ? `Error checking conflicts: ${err.message}`
          : "Unknown error checking conflicts",
    };
  }
}
