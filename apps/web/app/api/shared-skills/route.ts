/**
 * GET /api/shared-skills — Returns inventory of cross-agent shared skills.
 * Scans shared-skills/ for SKILL.md files and parses frontmatter.
 *
 * U2.6: Cross-agent shared-skills/ infrastructure. V2 agent endpoint.
 */
import { NextResponse } from "next/server";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const SHARED_SKILLS_DIR = join(process.cwd(), "shared-skills");

interface SharedSkillEntry {
  name: string;
  description: string;
  version: string;
  path: string;
}

function parseFrontmatter(content: string): { name: string; description: string; version: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const fm = match[1];
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*(.+)$/m);
  const verMatch = fm.match(/^version:\s*(.+)$/m);

  return {
    name: nameMatch?.[1]?.trim() ?? "unknown",
    description: descMatch?.[1]?.trim() ?? "No description",
    version: verMatch?.[1]?.trim() ?? "0.0.0",
  };
}

function discoverSharedSkills(): SharedSkillEntry[] {
  const skills: SharedSkillEntry[] = [];

  if (!existsSync(SHARED_SKILLS_DIR)) return skills;

  const entries = readdirSync(SHARED_SKILLS_DIR, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(SHARED_SKILLS_DIR, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    try {
      const content = readFileSync(skillPath, "utf-8");
      const fm = parseFrontmatter(content);
      if (fm) {
        skills.push({
          name: fm.name,
          description: fm.description,
          version: fm.version,
          path: `shared-skills/${entry.name}/SKILL.md`,
        });
      }
    } catch (err) {
      console.warn(`[shared-skills] Failed to read: ${skillPath}`, err);
    }
  }

  return skills;
}

export async function GET() {
  const skills = discoverSharedSkills();

  return NextResponse.json({
    shared_skills: skills,
    count: skills.length,
    cross_agent: true,
    agents: ["neptune-chat", "neptune-v2"],
    built_in_skills: 13,
    note: "These shared skills are loaded by both Chat and V2 agents on startup. V2 also has 13 additional built-in skills from open-agents.",
  });
}
