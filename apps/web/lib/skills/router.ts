/**
 * Skill Router — analyzes user prompts and loads relevant SKILL.md files
 * from .agents/skills/ into the system prompt at task start.
 *
 * How it works:
 * 1. Scans .agents/skills/&lt;skill-dir&gt;/SKILL.md frontmatter (name + description)
 * 2. Builds keyword-trigger index from trigger keywords in descriptions
 * 3. Scores each skill against the user prompt
 * 4. Returns top 3-5 matches for injection into system prompt
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SkillFrontmatter {
  name: string;
  description: string;
  path: string; // Relative path from .agents/skills/
}

export interface SkillMatch {
  skill: SkillFrontmatter;
  score: number; // 0-100
  matchedTriggers: string[];
}

export interface SkillLoadResult {
  matches: SkillMatch[];
  skillContents: Array<{ name: string; content: string }>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SKILLS_DIR = join(process.cwd(), ".agents", "skills");
const BUILTIN_SKILLS_DIR = join(process.cwd(), "skills", "built-in");
const MAX_SKILLS_TO_LOAD = 5;

// ─── Frontmatter Parser ──────────────────────────────────────────────────────

function parseFrontmatter(content: string): { name: string; description: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const frontmatter = match[1];
  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);

  if (!nameMatch || !descMatch) return null;

  return {
    name: nameMatch[1].trim(),
    description: descMatch[1].trim(),
  };
}

// ─── Trigger Extraction ──────────────────────────────────────────────────────

/**
 * Extract trigger keywords from a skill description.
 * Trigger phrases are typically found after "Triggers on" or in quotes.
 */
function extractTriggers(description: string): string[] {
  const triggers: string[] = [];

  // Split by common delimiters in trigger sections
  const parts = description.split(/[.,;]/);
  for (const part of parts) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;

    // Extract quoted triggers: "deploy", "vercel", "ship"
    const quoted = trimmed.match(/"([^"]+)"/g);
    if (quoted) {
      for (const q of quoted) {
        triggers.push(q.replace(/"/g, "").toLowerCase());
      }
    }
  }

  // Also add full description as low-weight match source
  return triggers;
}

// ─── Skill Discovery ─────────────────────────────────────────────────────────

/**
 * Discover all available SKILL.md files and parse their frontmatter.
 */
function discoverSkillsFromDir(skillsDir: string): SkillFrontmatter[] {
  const skills: SkillFrontmatter[] = [];

  if (!existsSync(skillsDir)) return skills;

  const entries = readdirSync(skillsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillPath = join(skillsDir, entry.name, "SKILL.md");
    if (!existsSync(skillPath)) continue;

    try {
      const content = readFileSync(skillPath, "utf-8");
      const fm = parseFrontmatter(content);
      if (fm) {
        skills.push({
          name: fm.name,
          description: fm.description,
          path: skillPath,
        });
      }
    } catch (err) {
      console.warn(`[skills/router] Failed to read skill: ${skillPath}`, err);
    }
  }

  return skills;
}

export function discoverSkills(skillsDir: string = SKILLS_DIR): SkillFrontmatter[] {
  const skills = discoverSkillsFromDir(skillsDir);

  // Also scan built-in skills shipped with the repo
  if (existsSync(BUILTIN_SKILLS_DIR) && BUILTIN_SKILLS_DIR !== skillsDir) {
    skills.push(...discoverSkillsFromDir(BUILTIN_SKILLS_DIR));
  }

  if (skills.length === 0) {
    console.warn(`[skills/router] No skills found in: ${skillsDir}, ${BUILTIN_SKILLS_DIR}`);
  }

  return skills;
}

// ─── Scoring Engine ──────────────────────────────────────────────────────────

/**
 * Score a skill against a user prompt.
 *
 * Scoring dimensions:
 * - Direct trigger match (highest weight): prompt contains exact trigger keyword
 * - Semantic overlap: prompt words match words in description
 * - Prefix match: prompt starts with a trigger phrase (command-like)
 */
function scoreSkill(prompt: string, skill: SkillFrontmatter): { score: number; matchedTriggers: string[] } {
  const normalizedPrompt = prompt.toLowerCase();
  const triggers = extractTriggers(skill.description);
  const matchedTriggers: string[] = [];
  let score = 0;

  // 1. Direct trigger keyword matches (weight: 15 per exact match)
  for (const trigger of triggers) {
    if (normalizedPrompt.includes(trigger)) {
      matchedTriggers.push(trigger);
      score += 15;
    }
  }

  // 2. Word-level overlap in description
  const promptWords = new Set(
    normalizedPrompt
      .split(/[\s,;.?!()\[\]{}"]+/)
      .filter((w) => w.length > 2),
  );
  const descWords = new Set(
    skill.description
      .toLowerCase()
      .split(/[\s,;.?!()\[\]{}"]+/)
      .filter((w) => w.length > 2),
  );

  let overlapCount = 0;
  for (const word of promptWords) {
    if (descWords.has(word)) {
      overlapCount++;
    }
  }

  // Weight: 3 points per overlapping word (capped at 45)
  score += Math.min(overlapCount * 3, 45);

  // 3. Bonus: skill name is in prompt
  if (normalizedPrompt.includes(skill.name.toLowerCase())) {
    score += 20;
  }

  // 4. Bonus: first-word match (command-like)
  const firstWord = normalizedPrompt.split(/\s+/)[0];
  if (triggers.some((t) => t.startsWith(firstWord))) {
    score += 10;
  }

  return { score: Math.min(score, 100), matchedTriggers };
}

// ─── Core Router Function ────────────────────────────────────────────────────

/**
 * Load relevant skills based on the user's prompt.
 *
 * @param userPrompt - The user's message/prompt text
 * @param maxSkills - Maximum number of skills to return (default: 5)
 * @returns Top matching skills with their full content for system prompt injection
 */
export async function loadRelevantSkills(
  userPrompt: string,
  maxSkills: number = MAX_SKILLS_TO_LOAD,
): Promise<SkillLoadResult> {
  const allSkills = discoverSkills();

  if (allSkills.length === 0) {
    return { matches: [], skillContents: [] };
  }

  // Score all skills
  const scored: SkillMatch[] = allSkills.map((skill) => ({
    skill,
    ...scoreSkill(userPrompt, skill),
  }));

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);

  // Only include skills with score > 0 (some relevance)
  const relevant = scored.filter((m) => m.score > 0).slice(0, maxSkills);

  // Load skill content
  const skillContents = relevant.map((match) => {
    let content = "";
    try {
      content = readFileSync(match.skill.path, "utf-8");
    } catch {
      content = `# ${match.skill.name}\n\n${match.skill.description}\n\n(Content unavailable)`;
    }
    return { name: match.skill.name, content };
  });

  return {
    matches: relevant,
    skillContents,
  };
}

/**
 * Lightweight version: only returns skill names and descriptions (no full content).
 * Used when you need to show available skills without loading all content.
 */
export function matchSkills(userPrompt: string, maxSkills: number = 5): Array<{ name: string; score: number }> {
  const allSkills = discoverSkills();
  return allSkills
    .map((skill) => ({
      name: skill.name,
      ...scoreSkill(userPrompt, skill),
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSkills)
    .map(({ name, score }) => ({ name, score }));
}

/**
 * Build a system prompt augmentation from loaded skills.
 * Appends skill content to the system prompt with clear delimiters.
 */
export function buildSkillPromptAugmentation(skillContents: Array<{ name: string; content: string }>): string {
  if (skillContents.length === 0) return "";

  const sections = skillContents.map(
    (skill) =>
      `\n<!-- SKILL: ${skill.name} -->\n${skill.content}\n<!-- END SKILL: ${skill.name} -->`,
  );

  return `\n## Loaded Skills\n\nThese skills were auto-loaded based on your task. Follow their guidance.\n${sections.join("\n")}`;
}
