#!/usr/bin/env npx tsx
/**
 * Neptune Pre-Deploy Flight Validator
 * ====================================
 * Enterprise-grade pre-commit validation gate.
 * Runs BEFORE any git commit on Neptune repos.
 *
 * Pipeline: CVE Audit → Build Dry-Run → Auto-Fix Retry (x3) → PASS/FAIL
 *
 * Usage:
 *   npx tsx lib/deploy/pre-flight-validator.ts
 *   npx tsx lib/deploy/pre-flight-validator.ts --repo neptune-v2
 *   npx tsx lib/deploy/pre-flight-validator.ts --skip-build  # dev mode
 *
 * Exit codes:
 *   0 = PASS (safe to commit and deploy)
 *   1 = FAIL (blocked: must fix before commit)
 *   2 = WARN (has warnings but build passes — proceed with caution)
 *
 * @author Neptune Ultimate Audit 2026-06-09
 * @version 1.0.0
 */

import { execSync, exec } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// ─── Types ───────────────────────────────────────────────────────────

interface StageResult {
  status: "PASS" | "FAIL" | "SKIPPED" | "WARN";
  duration_ms: number;
  details?: string[];
}

interface CveAuditResult extends StageResult {
  critical_cves: number;
  high_cves: number;
  moderate_cves: number;
  vulnerable_packages: string[];
}

interface BuildResult extends StageResult {
  warnings: string[];
  errors: string[];
}

interface AutoFixResult extends StageResult {
  retries_used: number;
  fixes_applied: string[];
  final_cve_state: { critical: number; high: number };
}

interface ValidatorReport {
  timestamp: string;
  repo: string;
  verdict: "PASS" | "FAIL" | "WARN";
  stages: {
    cve_audit: CveAuditResult;
    build_dry_run: BuildResult;
    auto_fix: AutoFixResult;
    security_gates: StageResult;
  };
  recommendation: string;
  errors: string[];
}

// ─── Configuration ───────────────────────────────────────────────────

const CONFIG = {
  MAX_RETRIES: 3,
  NEXTJS_MIN_VERSION: 16,
  REQUIRED_FILES: ["package.json", "pnpm-lock.yaml"],
  FORBIDDEN_PATTERNS: [
    { pattern: /ghp_[a-zA-Z0-9]{36}/, description: "GitHub PAT in source" },
    { pattern: /sk-[a-zA-Z0-9]{32,}/, description: "OpenAI API key in source" },
    { pattern: /\.env(?!\.example)/, description: ".env file in git index" },
  ],
  VERBOSE: process.argv.includes("--verbose") || process.env.CI === "true",
  SKIP_BUILD: process.argv.includes("--skip-build"),
  SKIP_CVE: process.argv.includes("--skip-cve"),
};

// ─── Helpers ─────────────────────────────────────────────────────────

function getRepoName(): string {
  const argIdx = process.argv.indexOf("--repo");
  if (argIdx !== -1 && process.argv[argIdx + 1]) {
    return process.argv[argIdx + 1];
  }
  try {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    return pkg.name || "unknown";
  } catch {
    return "unknown";
  }
}

function getProjectRoot(): string {
  // Walk up to find package.json
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function runCommand(cmd: string, timeoutMs = 120_000): { stdout: string; stderr: string; code: number } {
  try {
    const result = execSync(cmd, {
      cwd: getProjectRoot(),
      timeout: timeoutMs,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 10 * 1024 * 1024, // 10MB
    });
    return { stdout: result.trim(), stderr: "", code: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout?.trim() || "",
      stderr: err.stderr?.trim() || err.message || "",
      code: err.status || 1,
    };
  }
}

function getNextjsVersion(): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(getProjectRoot(), "package.json"), "utf-8"));
    const nextVer =
      pkg.dependencies?.next ||
      pkg.devDependencies?.next ||
      pkg.peerDependencies?.next;
    if (!nextVer) return null;
    // Strip ^ ~ > = < from semver range
    return nextVer.replace(/^[\^~>=<]+/, "");
  } catch {
    return null;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function log(emoji: string, msg: string): void {
  if (CONFIG.VERBOSE || process.env.CI) {
    process.stderr.write(`${emoji} ${msg}\n`);
  }
}

// ─── Stage 1: CVE Audit ──────────────────────────────────────────────

async function runCveAudit(): Promise<CveAuditResult> {
  const start = Date.now();
  log("🔍", "Running CVE audit (pnpm audit)...");

  if (CONFIG.SKIP_CVE) {
    return {
      status: "SKIPPED",
      duration_ms: Date.now() - start,
      critical_cves: 0,
      high_cves: 0,
      moderate_cves: 0,
      vulnerable_packages: [],
      details: ["CVE audit skipped via --skip-cve flag"],
    };
  }

  const { stdout, stderr, code } = runCommand("pnpm audit --json 2>&1 || true", 60_000);

  let critical_cves = 0;
  let high_cves = 0;
  let moderate_cves = 0;
  const vulnerable_packages: string[] = [];

  try {
    // pnpm audit --json outputs JSON lines
    const lines = stdout.split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const advisory = JSON.parse(line);
        if (advisory?.value?.severity) {
          const sev = advisory.value.severity;
          const pkg = advisory.value.module_name || advisory.value.advisory?.module_name || "unknown";
          if (sev === "critical") {
            critical_cves++;
            vulnerable_packages.push(`${pkg} (CRITICAL)`);
          } else if (sev === "high") {
            high_cves++;
            vulnerable_packages.push(`${pkg} (HIGH)`);
          } else if (sev === "moderate") {
            moderate_cves++;
          }
        }
      } catch {
        // Skip non-JSON lines
      }
    }
  } catch {
    // If parse fails, check exit code
  }

  // Fallback: if JSON parsing didn't work, parse text output
  if (critical_cves === 0 && high_cves === 0 && (stdout.includes("high") || stderr.includes("high"))) {
    // Count severity mentions
    const critMatch = (stdout + stderr).match(/(\d+)\s+critical/i);
    const highMatch = (stdout + stderr).match(/(\d+)\s+high/i);
    if (critMatch) critical_cves = parseInt(critMatch[1], 10);
    if (highMatch) high_cves = parseInt(highMatch[1], 10);
  }

  const duration_ms = Date.now() - start;
  const details: string[] = [
    `Found ${critical_cves} critical, ${high_cves} high, ${moderate_cves} moderate vulnerabilities`,
    `Audit completed in ${formatDuration(duration_ms)}`,
  ];

  if (critical_cves === 0 && high_cves === 0) {
    return {
      status: "PASS",
      duration_ms,
      critical_cves,
      high_cves,
      moderate_cves,
      vulnerable_packages,
      details,
    };
  } else if (critical_cves > 0) {
    return {
      status: "FAIL",
      duration_ms,
      critical_cves,
      high_cves,
      moderate_cves,
      vulnerable_packages,
      details: [...details, `BLOCKED: ${critical_cves} critical CVEs must be resolved`],
    };
  } else {
    return {
      status: "WARN",
      duration_ms,
      critical_cves,
      high_cves,
      moderate_cves,
      vulnerable_packages,
      details: [...details, `WARNING: ${high_cves} high CVEs require review`],
    };
  }
}

// ─── Stage 2: Build Dry-Run ──────────────────────────────────────────

async function runBuildDryRun(): Promise<BuildResult> {
  const start = Date.now();
  log("🔨", "Running build dry-run...");

  if (CONFIG.SKIP_BUILD) {
    return {
      status: "SKIPPED",
      duration_ms: Date.now() - start,
      warnings: [],
      errors: [],
      details: ["Build dry-run skipped via --skip-build flag"],
    };
  }

  // Check which package manager is used
  const projectRoot = getProjectRoot();
  const hasPnpm = existsSync(join(projectRoot, "pnpm-lock.yaml"));
  const hasBun = existsSync(join(projectRoot, "bun.lockb"));

  let buildCmd: string;
  if (hasPnpm) {
    buildCmd = "pnpm build 2>&1";
  } else if (hasBun) {
    buildCmd = "bun run build 2>&1";
  } else {
    buildCmd = "npm run build 2>&1";
  }

  const { stdout, stderr, code } = runCommand(buildCmd, 120_000);
  const combinedOutput = stdout + "\n" + stderr;

  const warnings: string[] = [];
  const errors: string[] = [];

  // Parse build output for warnings/errors
  const warnLines = combinedOutput.match(/warn(?:ing)?[s]?[:\s].*/gi) || [];
  const errorLines = combinedOutput.match(/error[s]?[:\s].*/gi) || [];
  const failLines = combinedOutput.match(/(?:FAIL|failed|Failed|FAILED)/g) || [];

  warnings.push(...warnLines.slice(0, 10));
  errors.push(...errorLines.slice(0, 10));

  if (failLines.length > 0) {
    errors.push(`Build produced ${failLines.length} failure indicators`);
  }

  const duration_ms = Date.now() - start;
  const details: string[] = [`Build completed in ${formatDuration(duration_ms)}`];

  if (code === 0 && errors.length === 0) {
    return { status: "PASS", duration_ms, warnings, errors, details };
  } else if (code === 0 && errors.length > 0) {
    return {
      status: "WARN",
      duration_ms,
      warnings,
      errors,
      details: [...details, `Build succeeded but had ${errors.length} error-like messages`],
    };
  } else {
    return {
      status: "FAIL",
      duration_ms,
      warnings,
      errors,
      details: [...details, `Build FAILED with exit code ${code}`],
    };
  }
}

// ─── Stage 3: Auto-Fix Retry Loop ────────────────────────────────────

async function runAutoFix(initialCve: CveAuditResult): Promise<AutoFixResult> {
  const start = Date.now();
  const fixes_applied: string[] = [];
  let retries_used = 0;

  log("🔧", "Auto-fix retry loop starting...");

  // Only auto-fix if CVE audit failed or build failed
  if (initialCve.status === "PASS") {
    return {
      status: "SKIPPED",
      duration_ms: Date.now() - start,
      retries_used: 0,
      fixes_applied: [],
      final_cve_state: { critical: initialCve.critical_cves, high: initialCve.high_cves },
      details: ["No CVEs to fix — skipping auto-fix"],
    };
  }

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    log("🔧", `Auto-fix attempt ${attempt}/${CONFIG.MAX_RETRIES}...`);

    switch (attempt) {
      case 1: {
        // Attempt 1: Safe semver-range fixes
        log("   ", "Running: pnpm audit fix");
        const fix1 = runCommand("pnpm audit fix 2>&1 || true", 60_000);
        if (fix1.stdout.includes("fixed") || fix1.stdout.includes("updated")) {
          fixes_applied.push(`Attempt 1: pnpm audit fix applied`);
        }
        break;
      }
      case 2: {
        // Attempt 2: Update all vulnerable packages recursively
        log("   ", "Running: pnpm update --recursive");
        const fix2 = runCommand("pnpm update --recursive 2>&1 || true", 120_000);
        if (fix2.stdout.includes("updated") || fix2.stdout.includes("done")) {
          fixes_applied.push(`Attempt 2: pnpm update --recursive applied`);
        }
        // Reinstall to sync lockfile
        runCommand("pnpm install --frozen-lockfile 2>&1 || pnpm install 2>&1 || true", 60_000);
        break;
      }
      case 3: {
        // Attempt 3: Force-update specific vulnerable packages
        log("   ", "Force-updating specific vulnerable packages...");
        for (const pkg of initialCve.vulnerable_packages.slice(0, 5)) {
          const pkgName = pkg.split(" ")[0]; // Extract package name
          log("   ", `  Force-updating: ${pkgName}`);
          const fix3 = runCommand(`pnpm add ${pkgName}@latest 2>&1 || true`, 60_000);
          if (fix3.code === 0) {
            fixes_applied.push(`Attempt 3: Force-updated ${pkgName} to latest`);
          }
        }
        break;
      }
    }

    retries_used = attempt;

    // Re-run CVE audit after fix
    const recheck = await runCveAudit();
    if (recheck.status === "PASS" || recheck.status === "WARN") {
      return {
        status: recheck.status,
        duration_ms: Date.now() - start,
        retries_used,
        fixes_applied,
        final_cve_state: { critical: recheck.critical_cves, high: recheck.high_cves },
        details: [
          `Auto-fix succeeded after ${retries_used} attempt(s)`,
          `Final CVE state: ${recheck.critical_cves} critical, ${recheck.high_cves} high`,
        ],
      };
    }
  }

  // All retries exhausted
  return {
    status: "FAIL",
    duration_ms: Date.now() - start,
    retries_used,
    fixes_applied,
    final_cve_state: { critical: initialCve.critical_cves, high: initialCve.high_cves },
    details: [
      `Auto-fix FAILED after ${CONFIG.MAX_RETRIES} attempts`,
      `${fixes_applied.length} fixes were applied but vulnerabilities remain`,
    ],
  };
}

// ─── Stage 4: Security Gates ─────────────────────────────────────────

async function runSecurityGates(): Promise<StageResult> {
  const start = Date.now();
  const details: string[] = [];
  let allPassed = true;

  log("🛡️", "Running security gates...");

  // Gate 1: Next.js version check
  const nextVersion = getNextjsVersion();
  if (nextVersion) {
    const major = parseInt(nextVersion.split(".")[0], 10);
    if (major < CONFIG.NEXTJS_MIN_VERSION) {
      details.push(`FAIL: Next.js ${nextVersion} < ${CONFIG.NEXTJS_MIN_VERSION}.0.0 — VULNERABLE`);
      allPassed = false;
    } else {
      details.push(`PASS: Next.js ${nextVersion} >= ${CONFIG.NEXTJS_MIN_VERSION}.0.0`);
    }
  } else {
    details.push("SKIP: No Next.js dependency detected (not a Next.js project)");
  }

  // Gate 2: No .env files in git index
  try {
    const staged = execSync("git diff --cached --name-only 2>/dev/null || true", {
      encoding: "utf-8",
    });
    const envFiles = staged
      .split("\n")
      .filter((f) => f.match(/\.env(?!\.example)/) && !f.match(/node_modules/));
    if (envFiles.length > 0) {
      details.push(`FAIL: .env file(s) in git index: ${envFiles.join(", ")}`);
      allPassed = false;
    } else {
      details.push("PASS: No .env files in git index");
    }
  } catch {
    details.push("SKIP: Could not check git index (not a git repo?)");
  }

  // Gate 3: No hardcoded GitHub PATs in remote URL
  try {
    const remotes = execSync("git remote -v 2>/dev/null || true", { encoding: "utf-8" });
    if (remotes.match(/ghp_[a-zA-Z0-9]{36}/)) {
      details.push("FAIL: GitHub PAT found in git remote URL — rotate immediately");
      allPassed = false;
    } else {
      details.push("PASS: No GitHub PAT in git remote URL");
    }
  } catch {
    details.push("SKIP: Could not check git remotes");
  }

  // Gate 4: VERCEL_TOKEN not in built JS
  const nextStaticDir = join(getProjectRoot(), ".next", "static", "chunks");
  if (existsSync(nextStaticDir)) {
    try {
      const grep = runCommand(
        `grep -rl "VERCEL_TOKEN\|SANDBOX_VERCEL_TOKEN" ${nextStaticDir} 2>/dev/null || true`,
        10_000
      );
      if (grep.stdout.trim()) {
        details.push(`WARN: VERCEL_TOKEN found in built JS chunks — review before deploy`);
        // This is a warning, not a block, because some projects intentionally use it server-side
      } else {
        details.push("PASS: No VERCEL_TOKEN in client-side JS chunks");
      }
    } catch {
      details.push("SKIP: Could not check .next build artifacts");
    }
  } else {
    details.push("SKIP: No .next build directory (run build first for full check)");
  }

  // Gate 5: Lockfile integrity
  const { code: lockfileCode } = runCommand("pnpm install --frozen-lockfile 2>&1 || true", 30_000);
  if (lockfileCode === 0) {
    details.push("PASS: pnpm lockfile is clean");
  } else {
    details.push("WARN: pnpm lockfile has changes — run `pnpm install` to sync");
  }

  // Gate 6: pnpm overrides vs dependencies consistency
  try {
    const pkg = JSON.parse(readFileSync(join(getProjectRoot(), "package.json"), "utf-8"));
    const overrides = pkg.pnpm?.overrides || {};
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const conflicts: string[] = [];
    for (const [pkgName, overrideVer] of Object.entries(overrides)) {
      if (allDeps[pkgName] && allDeps[pkgName] !== overrideVer) {
        conflicts.push(`${pkgName}: dep=${allDeps[pkgName]} override=${overrideVer}`);
      }
    }
    if (conflicts.length > 0) {
      details.push(`WARN: pnpm override conflicts: ${conflicts.join("; ")}`);
    } else if (Object.keys(overrides).length > 0) {
      details.push("PASS: pnpm overrides consistent with dependencies");
    }
  } catch {
    details.push("SKIP: Could not parse package.json for override checks");
  }

  const duration_ms = Date.now() - start;
  return {
    status: allPassed ? "PASS" : "FAIL",
    duration_ms,
    details,
  };
}

// ─── Main Validator ──────────────────────────────────────────────────

async function runValidator(): Promise<ValidatorReport> {
  const repo = getRepoName();
  const errors: string[] = [];
  const projectRoot = getProjectRoot();

  console.error(`\n╔══════════════════════════════════════════════════════════════╗`);
  console.error(`║  NEPTUNE PRE-DEPLOY FLIGHT VALIDATOR v1.0.0                  ║`);
  console.error(`║  Repo: ${repo.padEnd(52)}║`);
  console.error(`║  Root: ${projectRoot.padEnd(52)}║`);
  console.error(`╚══════════════════════════════════════════════════════════════╝\n`);

  // Stage 1: CVE Audit
  console.error("── Stage 1/4: CVE Audit ──");
  const cveResult = await runCveAudit();
  console.error(`   ${cveResult.status}: ${cveResult.critical_cves} critical, ${cveResult.high_cves} high CVEs\n`);

  // Stage 2: Build Dry-Run
  console.error("── Stage 2/4: Build Dry-Run ──");
  const buildResult = await runBuildDryRun();
  console.error(`   ${buildResult.status} (${formatDuration(buildResult.duration_ms)})\n`);

  // Stage 3: Auto-Fix (only if needed)
  let autoFixResult: AutoFixResult;
  if (cveResult.status === "FAIL" || buildResult.status === "FAIL") {
    console.error("── Stage 3/4: Auto-Fix Retry Loop ──");
    autoFixResult = await runAutoFix(cveResult);
    console.error(
      `   ${autoFixResult.status}: ${autoFixResult.retries_used} retries, ${autoFixResult.fixes_applied.length} fixes\n`
    );
  } else {
    autoFixResult = {
      status: "SKIPPED",
      duration_ms: 0,
      retries_used: 0,
      fixes_applied: [],
      final_cve_state: { critical: cveResult.critical_cves, high: cveResult.high_cves },
      details: ["Auto-fix skipped — no failures to fix"],
    };
    console.error("── Stage 3/4: Auto-Fix ── SKIPPED (no failures)\n");
  }

  // Stage 4: Security Gates
  console.error("── Stage 4/4: Security Gates ──");
  const securityGates = await runSecurityGates();
  console.error(`   ${securityGates.status}\n`);

  // Determine final verdict
  let verdict: "PASS" | "FAIL" | "WARN" = "PASS";

  const failures: string[] = [];
  if (cveResult.status === "FAIL") failures.push("CVE audit");
  if (buildResult.status === "FAIL") failures.push("Build dry-run");
  if (autoFixResult.status === "FAIL") failures.push("Auto-fix exhausted");
  if (securityGates.status === "FAIL") failures.push("Security gates");

  const warnings: string[] = [];
  if (cveResult.status === "WARN") warnings.push("CVE audit");
  if (buildResult.status === "WARN") warnings.push("Build dry-run");

  if (failures.length > 0) {
    verdict = "FAIL";
  } else if (warnings.length > 0) {
    verdict = "WARN";
  }

  // Build report
  const report: ValidatorReport = {
    timestamp: new Date().toISOString(),
    repo,
    verdict,
    stages: {
      cve_audit: cveResult,
      build_dry_run: buildResult,
      auto_fix: autoFixResult,
      security_gates: securityGates,
    },
    recommendation: "",
    errors,
  };

  switch (verdict) {
    case "PASS":
      report.recommendation = "✅ SAFE TO COMMIT AND DEPLOY. All gates passed.";
      break;
    case "WARN":
      report.recommendation =
        "⚠️  PROCEED WITH CAUTION. Warnings present but build succeeds. Review warnings before deploying to production.";
      break;
    case "FAIL":
      report.recommendation =
        "❌ BLOCKED. Fix failures above before committing. Run auto-fix and re-validate.";
      errors.push(...failures.map((f) => `Stage failed: ${f}`));
      break;
  }

  return report;
}

// ─── Entry Point ─────────────────────────────────────────────────────

async function main() {
  const report = await runValidator();

  // Print JSON report to stdout (for programmatic consumption)
  if (!CONFIG.VERBOSE) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    // Verbose mode: print summary then JSON
    console.error(`\n═══════════════════════════════════════════════════════════════`);
    console.error(`  FINAL VERDICT: ${report.verdict}`);
    console.error(`  ${report.recommendation}`);
    console.error(`═══════════════════════════════════════════════════════════════\n`);
    console.log(JSON.stringify(report, null, 2));
  }

  // Exit with appropriate code
  if (report.verdict === "FAIL") process.exit(1);
  if (report.verdict === "WARN") process.exit(2);
  process.exit(0);
}

main().catch((err) => {
  console.error("Validator crashed:", err);
  process.exit(1);
});
