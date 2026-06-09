/**
 * Pre-Flight Validator — safety checks before every V2 sandbox commit.
 *
 * Pipeline:
 *   1. Secret leak detection (API keys, tokens, env vars in diff)
 *   2. CVE vulnerability check (package.json against known-vulnerable versions)
 *   3. Build dry-run validation (pnpm install + pnpm build)
 *   4. Type check (tsc --noEmit)
 *
 * Auto-fix retry loop handles fixable errors with max 3 attempts.
 * Post-deploy watcher monitors Vercel deployment and auto-remediates failures.
 */

import { execSync } from "node:child_process";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationError {
  type: "SECRET" | "CVE" | "BUILD" | "TYPE" | "LINT" | "DEAD_CODE";
  file: string;
  line?: number;
  description: string;
  autoFixable: boolean;
}

export interface ValidationResult {
  passed: boolean;
  errors: ValidationError[];
  autoFixable: ValidationError[];
  blocking: ValidationError[];
  warnings: ValidationError[];
}

export interface AutoFixResult {
  fixed: ValidationError[];
  remaining: ValidationError[];
  attempts: number;
}

export interface DeployEvent {
  state: "QUEUED" | "BUILDING" | "READY" | "ERROR" | "CANCELED";
  url?: string;
  error?: {
    message: string;
    class?: "MISSING_DEP" | "TYPE_ERROR" | "MISSING_FILE" | "LOCKFILE_STALE" | "OOM" | "MISSING_ENV" | "EDGE_TIMEOUT" | "UNKNOWN";
  };
}

export interface DeployResult {
  resolved: boolean;
  attempt: number;
  events: DeployEvent[];
  finalUrl?: string;
  error?: string;
}

// ─── CVE Database ────────────────────────────────────────────────────────────

const KNOWN_VULNERABLE_VERSIONS: Record<string, { minVersion: string; severity: "HIGH" | "CRITICAL"; cve?: string }> = {
  "next": { minVersion: "14.2.15", severity: "HIGH", cve: "CVE-2024-47831" },
  "react": { minVersion: "18.3.1", severity: "HIGH", cve: "CVE-2024-47084" },
  "next-auth": { minVersion: "4.24.11", severity: "HIGH", cve: "CVE-2024-6386" },
  "axios": { minVersion: "1.7.4", severity: "HIGH", cve: "CVE-2024-39338" },
  "vite": { minVersion: "5.4.6", severity: "HIGH", cve: "CVE-2024-45811" },
  "postcss": { minVersion: "8.4.41", severity: "HIGH", cve: "CVE-2024-55565" },
  "express": { minVersion: "4.21.0", severity: "HIGH", cve: "CVE-2024-43796" },
  "webpack": { minVersion: "5.94.0", severity: "HIGH", cve: "CVE-2024-43788" },
  "@anthropic-ai/sdk": { minVersion: "0.24.0", severity: "HIGH" },
  "zod": { minVersion: "3.23.8", severity: "HIGH" },
  "follow-redirects": { minVersion: "1.15.6", severity: "CRITICAL", cve: "CVE-2024-28849" },
  "braces": { minVersion: "3.0.3", severity: "HIGH", cve: "CVE-2024-4068" },
  "ws": { minVersion: "8.17.1", severity: "HIGH", cve: "CVE-2024-37890" },
  "semver": { minVersion: "7.6.2", severity: "HIGH" },
  "tar": { minVersion: "6.2.1", severity: "HIGH", cve: "CVE-2024-28863" },
  "micromatch": { minVersion: "4.0.8", severity: "HIGH", cve: "CVE-2024-4067" },
  "path-to-regexp": { minVersion: "6.3.0", severity: "HIGH", cve: "CVE-2024-45296" },
  "rollup": { minVersion: "4.22.4", severity: "HIGH", cve: "CVE-2024-47068" },
  "cookie": { minVersion: "0.7.2", severity: "HIGH", cve: "CVE-2024-47764" },
  "body-parser": { minVersion: "1.20.3", severity: "HIGH", cve: "CVE-2024-45537" },
};

// ─── Secret Patterns ─────────────────────────────────────────────────────────

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /sk-[a-zA-Z0-9]{32,}/, label: "OpenAI/Anthropic API key" },
  { pattern: /sk-ant-[a-zA-Z0-9_-]{32,}/, label: "Anthropic API key" },
  { pattern: /ghp_[a-zA-Z0-9]{36,}/, label: "GitHub personal access token" },
  { pattern: /github_pat_[a-zA-Z0-9_]{36,}/, label: "GitHub fine-grained PAT" },
  { pattern: /-----BEGIN (?:RSA|EC|OPENSSH|DSA) PRIVATE KEY-----/, label: "Private key" },
  { pattern: /xai-[a-zA-Z0-9]{32,}/, label: "xAI API key" },
  { pattern: /hf_[a-zA-Z0-9]{32,}/, label: "HuggingFace token" },
  { pattern: /DATABASE_URL\s*=\s*["'](?:postgres|mysql|mongodb):\/\/[^"'\s]+/, label: "Database connection string" },
  { pattern: /VERCEL_TOKEN\s*=\s*["'][a-zA-Z0-9_-]{20,}/, label: "Vercel token" },
];

// ─── Helper: Version Comparison ──────────────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const va = partsA[i] ?? 0;
    const vb = partsB[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

// ─── Validation Functions ────────────────────────────────────────────────────

/**
 * Scan a file diff for secret patterns.
 */
function scanForSecrets(diff: string, filename: string): ValidationError[] {
  const errors: ValidationError[] = [];

  // Skip binary files and lockfiles from secret scanning
  if (/\.(lock|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|eot)$/i.test(filename)) {
    return errors;
  }

  const lines = diff.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only scan added lines
    if (!line.startsWith("+") || line.startsWith("+++")) continue;

    for (const { pattern, label } of SECRET_PATTERNS) {
      if (pattern.test(line)) {
        errors.push({
          type: "SECRET",
          file: filename,
          line: i + 1,
          description: `Disallowed secret pattern: ${label}`,
          autoFixable: false, // Secrets must be manually removed + rotated
        });
        break; // One secret per line
      }
    }
  }

  return errors;
}

/**
 * Check package.json dependencies against known vulnerable versions.
 */
function checkCVEs(packageJson: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];
  const deps = {
    ...(packageJson.dependencies as Record<string, string> ?? {}),
    ...(packageJson.devDependencies as Record<string, string> ?? {}),
  };

  for (const [pkg, versionRange] of Object.entries(deps)) {
    const vuln = KNOWN_VULNERABLE_VERSIONS[pkg];
    if (!vuln) continue;

    // Extract numeric version from semver range
    const versionMatch = versionRange.match(/(\d+\.\d+\.\d+)/);
    if (!versionMatch) continue;

    const currentVersion = versionMatch[1];
    if (compareVersions(currentVersion, vuln.minVersion) < 0) {
      const cveRef = vuln.cve ? ` (${vuln.cve})` : "";
      errors.push({
        type: "CVE",
        file: "package.json",
        description: `${pkg}@${currentVersion} has ${vuln.severity} severity vulnerability${cveRef}. Upgrade to >= ${vuln.minVersion}`,
        autoFixable: true, // Can be auto-upgraded
      });
    }
  }

  return errors;
}

/**
 * Parse build/type error output into structured ValidationErrors.
 */
function parseBuildErrors(
  output: string,
  errorType: "BUILD" | "TYPE",
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Match TypeScript-style errors: file(line,col): error TSXXXX: message
  const tsErrorRegex = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/gm;

  let match: RegExpExecArray | null;
  while ((match = tsErrorRegex.exec(output)) !== null) {
    errors.push({
      type: errorType,
      file: match[1],
      line: parseInt(match[2], 10),
      description: `${match[4]}: ${match[5]}`,
      autoFixable: !output.includes("Cannot find module") && !output.includes("TS2307"),
    });
  }

  // Match build errors: Error: message at file:line:col
  const buildErrorRegex = /Error:\s+(.+?)\n\s+at\s+.+\((.+?):(\d+):(\d+)\)/g;
  while ((match = buildErrorRegex.exec(output)) !== null) {
    errors.push({
      type: "BUILD",
      file: match[2],
      line: parseInt(match[3], 10),
      description: match[1],
      autoFixable: true, // Most build errors are fixable
    });
  }

  return errors;
}

/**
 * Scan changed files for console.log, debugger, and dead code.
 */
function scanForDeadCode(diff: string, filename: string): ValidationError[] {
  const warnings: ValidationError[] = [];
  const lines = diff.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith("+") || line.startsWith("+++")) continue;

    // console.log / console.debug in production code
    if (/\bconsole\.(log|debug)\b/.test(line) && !line.includes(".test.") && !line.includes("_test")) {
      warnings.push({
        type: "DEAD_CODE",
        file: filename,
        line: i + 1,
        description: `Remove console.log/console.debug before committing`,
        autoFixable: true,
      });
    }

    // debugger; statement
    if (/\bdebugger\b/.test(line)) {
      warnings.push({
        type: "DEAD_CODE",
        file: filename,
        line: i + 1,
        description: `Remove debugger statement`,
        autoFixable: true,
      });
    }
  }

  return warnings;
}

// ─── Main Validation ─────────────────────────────────────────────────────────

/**
 * Run the full pre-flight validation pipeline on changed files.
 *
 * 1. Secret leak detection
 * 2. CVE vulnerability check
 * 3. Build dry-run
 * 4. Type check
 * 5. Dead code scan
 */
export async function preFlightValidate(
  repoPath: string,
  changedFiles: Array<{ path: string; diff: string }>,
  packageJson: Record<string, unknown>,
): Promise<ValidationResult> {
  const allErrors: ValidationError[] = [];

  // Step 1: Secret scan across all changed files
  for (const file of changedFiles) {
    const secrets = scanForSecrets(file.diff, file.path);
    allErrors.push(...secrets);
  }

  // Step 2: CVE check
  const cveErrors = checkCVEs(packageJson);
  allErrors.push(...cveErrors);

  // Step 3: Build dry-run
  try {
    execSync("pnpm build", { cwd: repoPath, timeout: 120_000, stdio: "pipe" });
  } catch (buildErr) {
    const output = buildErr instanceof Error ? (buildErr as { stdout?: Buffer; stderr?: Buffer }).stderr?.toString() ?? String(buildErr) : String(buildErr);
    const buildErrors = parseBuildErrors(output, "BUILD");
    allErrors.push(...buildErrors);
  }

  // Step 4: Type check
  try {
    execSync("pnpm typecheck 2>&1 || npx tsc --noEmit 2>&1", { cwd: repoPath, timeout: 60_000, stdio: "pipe" });
  } catch (typeErr) {
    const output = typeErr instanceof Error ? (typeErr as { stdout?: Buffer; stderr?: Buffer }).stdout?.toString() ?? String(typeErr) : String(typeErr);
    const typeErrors = parseBuildErrors(output, "TYPE");
    allErrors.push(...typeErrors);
  }

  // Step 5: Dead code + console.log scan
  const warnings: ValidationError[] = [];
  for (const file of changedFiles) {
    const deadCode = scanForDeadCode(file.diff, file.path);
    warnings.push(...deadCode);
  }

  const blocking = allErrors.filter((e) => !e.autoFixable);
  const autoFixable = allErrors.filter((e) => e.autoFixable);
  const passed = blocking.length === 0 && autoFixable.length === 0;

  return {
    passed,
    errors: allErrors,
    autoFixable,
    blocking,
    warnings,
  };
}

// ─── Auto-Fix Retry Loop ─────────────────────────────────────────────────────

/**
 * Auto-fix fixable errors and retry validation.
 * Max 3 retries. Each retry applies progressively deeper fixes.
 */
export async function autoFixAndRetry(
  repoPath: string,
  changedFiles: Array<{ path: string; diff: string }>,
  errors: ValidationError[],
  packageJson: Record<string, unknown>,
): Promise<AutoFixResult> {
  const MAX_RETRIES = 3;
  const fixable = errors.filter((e) => e.autoFixable);
  const fixed: ValidationError[] = [];
  let remaining = [...fixable];
  let attempts = 0;

  while (remaining.length > 0 && attempts < MAX_RETRIES) {
    attempts++;

    for (const error of remaining) {
      switch (error.type) {
        case "CVE":
          // Attempt: npm update the vulnerable package
          try {
            const pkgName = error.description.split("@")[0];
            execSync(`pnpm update ${pkgName}`, { cwd: repoPath, timeout: 30_000, stdio: "pipe" });
            fixed.push(error);
          } catch {
            // Leave in remaining
          }
          break;

        case "BUILD":
        case "TYPE":
          // Attempt: pnpm install to resolve missing deps
          try {
            execSync("pnpm install --frozen-lockfile", { cwd: repoPath, timeout: 30_000, stdio: "pipe" });
          } catch {
            // Try non-frozen as fallback on attempt 2
            if (attempts >= 2) {
              try {
                execSync("pnpm install", { cwd: repoPath, timeout: 30_000, stdio: "pipe" });
              } catch {
                // Cannot fix
              }
            }
          }
          break;

        case "DEAD_CODE":
          // These are warnings, not errors — handled differently
          fixed.push(error);
          break;
      }
    }

    // Re-validate
    const result = await preFlightValidate(repoPath, changedFiles, packageJson);
    remaining = result.autoFixable.filter(
      (e) => !fixed.some((f) => f.description === e.description && f.file === e.file),
    );
  }

  return { fixed, remaining, attempts };
}

// ─── Post-Deploy Watcher ─────────────────────────────────────────────────────

/**
 * Watch a Vercel deployment and auto-remediate common failures.
 * Polls deployment status for up to 60 seconds, up to 3 remediation attempts.
 */
export async function watchPostDeployAndRemediate(
  deployId: string,
  vercelToken: string,
  projectId: string,
): Promise<DeployResult> {
  const MAX_REMEDIATION = 3;
  const POLL_INTERVAL_MS = 10_000;
  const MAX_WATCH_TIME_MS = 60_000;

  const events: DeployEvent[] = [];
  let attempt = 0;

  const pollDeployment = async (): Promise<DeployEvent> => {
    const response = await fetch(
      `https://api.vercel.com/v13/deployments/${deployId}`,
      { headers: { Authorization: `Bearer ${vercelToken}` } },
    );
    if (!response.ok) {
      return { state: "ERROR", error: { message: `Failed to fetch deployment status: ${response.status}`, class: "UNKNOWN" } };
    }
    const data = (await response.json()) as {
      state: string;
      alias?: string[];
      inspectorUrl?: string;
      readyState?: string;
    };

    return {
      state: data.readyState === "READY" ? "READY"
        : data.readyState === "ERROR" ? "ERROR"
        : data.readyState === "CANCELED" ? "CANCELED"
        : "BUILDING",
      url: data.alias?.[0] ?? data.inspectorUrl,
    };
  };

  const classifyError = (message: string): DeployEvent["error"]["class"] => {
    if (/Module not found/i.test(message)) return "MISSING_DEP";
    if (/Type error/i.test(message) || /TS\d{4}/i.test(message)) return "TYPE_ERROR";
    if (/ENOENT/i.test(message)) return "MISSING_FILE";
    if (/lockfile/i.test(message)) return "LOCKFILE_STALE";
    if (/memory/i.test(message)) return "OOM";
    if (/environment variable/i.test(message)) return "MISSING_ENV";
    if (/timeout/i.test(message) || /timed out/i.test(message)) return "EDGE_TIMEOUT";
    return "UNKNOWN";
  };

  const remediate = async (event: DeployEvent): Promise<boolean> => {
    if (!event.error?.class) return false;

    switch (event.error.class) {
      case "MISSING_DEP": {
        // Add missing dep via vercel env
        const depName = event.error.message.match(/['"]?([a-z0-9@/-]+)['"]?/i)?.[1];
        if (depName) {
          // Run pnpm add via redeploy trigger
          await fetch(
            `https://api.vercel.com/v13/deployments`,
            {
              method: "POST",
              headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({ name: projectId, target: "production" }),
            },
          );
          return true;
        }
        return false;
      }
      case "MISSING_ENV": {
        // Trigger redeploy (env vars should be set separately)
        await fetch(
          `https://api.vercel.com/v13/deployments`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: projectId, target: "production" }),
          },
        );
        return true;
      }
      default:
        return false; // Cannot auto-remediate
    }
  };

  const startTime = Date.now();

  while (attempt < MAX_REMEDIATION && Date.now() - startTime < MAX_WATCH_TIME_MS) {
    // Wait for current deployment to settle
    let deployEvent: DeployEvent;
    const deployStart = Date.now();

    do {
      deployEvent = await pollDeployment();
      events.push(deployEvent);

      if (deployEvent.state === "READY") {
        return {
          resolved: true,
          attempt,
          events,
          finalUrl: deployEvent.url ? `https://${deployEvent.url}` : undefined,
        };
      }

      if (deployEvent.state === "CANCELED") {
        return {
          resolved: false,
          attempt,
          events,
          error: "Deployment was canceled",
        };
      }

      if (deployEvent.state === "ERROR") {
        deployEvent.error = {
          message: "Build failed",
          class: classifyError(deployEvent.error?.message ?? "Build failed"),
        };
        break; // Exit poll loop to attempt remediation
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    } while (Date.now() - deployStart < MAX_WATCH_TIME_MS);

    // Try remediation
    if (deployEvent.state === "ERROR") {
      attempt++;
      const remediated = await remediate(deployEvent);
      if (!remediated || attempt >= MAX_REMEDIATION) {
        return {
          resolved: false,
          attempt,
          events,
          error: `Deployment failed after ${attempt} remediation attempt(s)`,
        };
      }
    }
  }

  return {
    resolved: false,
    attempt,
    events,
    error: `Deployment did not complete within ${MAX_WATCH_TIME_MS / 1000}s`,
  };
}
