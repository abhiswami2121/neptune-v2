import "server-only";

import path from "node:path";
import type { Sandbox } from "@open-agents/sandbox";
import { resolveSandboxHomeDirectory } from "@/lib/sandbox/home-directory";

const PROJECT_SKILL_BASE_FOLDERS = [".claude", ".agents"];

/** Repo-shipped built-in skills directory (relative to repo root). */
const BUILTIN_SKILLS_PATH = "skills/built-in";

/** Cross-agent shared skills directory (relative to repo root). */
const SHARED_SKILLS_PATH = "shared-skills";

export function getProjectSkillDirectories(workingDirectory: string): string[] {
  return [
    ...PROJECT_SKILL_BASE_FOLDERS.map((folder) =>
      path.posix.join(workingDirectory, folder, "skills"),
    ),
    // Built-in skills shipped with the V2 repo
    path.posix.join(workingDirectory, BUILTIN_SKILLS_PATH),
    // Cross-agent shared skills (skill-author, deploy-discipline, etc.)
    path.posix.join(workingDirectory, SHARED_SKILLS_PATH),
  ];
}

export function getGlobalSkillsDirectory(homeDirectory: string): string {
  return path.posix.join(homeDirectory, ".agents", "skills");
}

export async function getSandboxSkillDirectories(
  sandbox: Sandbox,
): Promise<string[]> {
  const homeDirectory = await resolveSandboxHomeDirectory(sandbox);

  return [
    ...getProjectSkillDirectories(sandbox.workingDirectory),
    getGlobalSkillsDirectory(homeDirectory),
  ];
}
