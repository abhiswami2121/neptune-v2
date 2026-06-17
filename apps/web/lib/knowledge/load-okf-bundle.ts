/**
 * Load OKF Bundle — V2 Knowledge Integration
 *
 * Loads the NKS knowledge graph from the Chat app for V2 coding agent context.
 * The coding agent uses this to understand playbooks, skills, and PRDs
 * before generating code.
 *
 * NEPTUNE-KNOWLEDGE-SPEC v1.0 — Reference Implementation
 * Phase 43: V2 Coding Agent Maturation
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

// ============================================================================
// TYPES
// ============================================================================

export interface LoadedSkill {
  name: string;
  description: string;
  domain: string;
  version: string;
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
}

export interface LoadedPlaybook {
  name: string;
  domain: string;
  description: string;
  version: string;
  path: string;
  content: string;
  procedures: string[];
  connectors: string[];
  skills: string[];
}

export interface KnowledgeContext {
  skills: LoadedSkill[];
  playbooks: LoadedPlaybook[];
  relatedPrds: { name: string; path: string; description: string }[];
  graphStats: {
    totalNodes: number;
    totalEdges: number;
    relevantNodes: number;
  };
}

// ============================================================================
// CORTEX PATH (from Chat app)
// ============================================================================

const CHAT_CORTEX_PATH = path.resolve(
  "/home/neptune/neptune-chat/jarvis/cortex"
);

// ============================================================================
// LOADER
// ============================================================================

/**
 * Parse frontmatter from markdown content
 */
function parseFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)?$/);
  if (!match) return { frontmatter: {}, body: content };

  const yaml = match[1];
  const body = match[2] || "";
  const fm: Record<string, unknown> = {};

  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      fm[key] = value;
    }
  }

  return { frontmatter: fm, body };
}

/**
 * Load a skill by name or path
 */
export function loadSkill(skillName: string): LoadedSkill | null {
  const skillsDir = path.join(CHAT_CORTEX_PATH, "skills");

  // Try direct name match
  const directPath = path.join(skillsDir, skillName, "SKILL.md");
  if (fs.existsSync(directPath)) {
    const content = fs.readFileSync(directPath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);
    return {
      name: (frontmatter.name as string) || skillName,
      description: (frontmatter.description as string) || "",
      domain: (frontmatter.domain as string) || "",
      version: (frontmatter.version as string) || "0.1.0",
      path: directPath,
      content: body,
      frontmatter,
    };
  }

  // Search by name in frontmatter
  try {
    const entries = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = path.join(skillsDir, entry.name, "SKILL.md");
        if (fs.existsSync(skillPath)) {
          const content = fs.readFileSync(skillPath, "utf-8");
          const { frontmatter } = parseFrontmatter(content);
          if (
            frontmatter.name === skillName ||
            entry.name.includes(skillName)
          ) {
            const { body } = parseFrontmatter(content);
            return {
              name: (frontmatter.name as string) || entry.name,
              description: (frontmatter.description as string) || "",
              domain: (frontmatter.domain as string) || "",
              version: (frontmatter.version as string) || "0.1.0",
              path: skillPath,
              content: body,
              frontmatter,
            };
          }
        }
      }
    }
  } catch {
    // Skills dir not found
  }

  return null;
}

/**
 * Load a playbook by domain
 */
export function loadPlaybook(domain: string): LoadedPlaybook | null {
  const playbookPath = path.join(
    CHAT_CORTEX_PATH,
    "playbooks",
    domain,
    "playbook.md"
  );

  if (!fs.existsSync(playbookPath)) return null;

  const content = fs.readFileSync(playbookPath, "utf-8");
  const { frontmatter, body } = parseFrontmatter(content);

  // Extract procedure sections
  const procedures: string[] = [];
  const procMatch = body.match(/## Procedures\n\n([\s\S]*?)(?=\n## |$)/);
  if (procMatch) {
    const steps = procMatch[1].match(/### (.+)/g);
    if (steps) procedures.push(...steps.map((s) => s.replace("### ", "")));
  }

  return {
    name: (frontmatter.name as string) || domain,
    domain: (frontmatter.domain as string) || domain,
    description: (frontmatter.description as string) || "",
    version: (frontmatter.version as string) || "0.1.0",
    path: playbookPath,
    content: body,
    procedures,
    connectors: (frontmatter.connectors as string[]) || [],
    skills: (frontmatter.skills as string[]) || [],
  };
}

/**
 * Load full knowledge context for a coding session
 *
 * Given a task description, finds relevant skills and playbooks
 * to provide context to the coding agent.
 */
export function loadKnowledgeContext(task: string): KnowledgeContext {
  const skills: LoadedSkill[] = [];
  const playbooks: LoadedPlaybook[] = [];
  const relatedPrds: { name: string; path: string; description: string }[] =
    [];

  const taskLower = task.toLowerCase();

  // Extract domain from task keywords
  const domainKeywords: Record<string, string> = {
    billing: "billing",
    payment: "billing",
    nmi: "billing",
    enroll: "customer-enrollment",
    lead: "lead-flow",
    dispute: "credit-disputes",
    credit: "credit-disputes",
    support: "support-triage",
    ticket: "support-triage",
    compliance: "compliance-audit",
    report: "reporting",
    email: "customer-comms",
    sms: "customer-comms",
    call: "customer-comms",
    voice: "customer-comms",
    vapi: "customer-comms",
    slack: "mcp-edits",
  };

  const matchedDomains = new Set<string>();
  for (const [keyword, domain] of Object.entries(domainKeywords)) {
    if (taskLower.includes(keyword)) {
      matchedDomains.add(domain);
    }
  }

  // Load playbooks for matched domains
  for (const domain of matchedDomains) {
    const playbook = loadPlaybook(domain);
    if (playbook) {
      playbooks.push(playbook);

      // Load skills linked to this playbook
      for (const skillName of playbook.skills) {
        const skill = loadSkill(skillName);
        if (skill) skills.push(skill);
      }
    }
  }

  // Also load commonly related skills
  // Always include code-review, deploy-vercel-github for coding tasks
  const commonSkills = ["code-review", "deploy-vercel-github", "mcp-edits"];
  for (const name of commonSkills) {
    if (!skills.find((s) => s.name === name)) {
      const skill = loadSkill(name);
      if (skill) skills.push(skill);
    }
  }

  // Search PRDs
  try {
    const prdDir = path.join(CHAT_CORTEX_PATH, "prd");
    if (fs.existsSync(prdDir)) {
      const entries = fs.readdirSync(prdDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const prdFile = path.join(prdDir, entry.name, "prd.md");
          if (fs.existsSync(prdFile)) {
            const content = fs.readFileSync(prdFile, "utf-8");
            const { frontmatter } = parseFrontmatter(content);
            if (
              taskLower.includes(entry.name.toLowerCase()) ||
              (frontmatter.description as string)
                ?.toLowerCase()
                .includes(taskLower.split(" ")[0])
            ) {
              relatedPrds.push({
                name: (frontmatter.name as string) || entry.name,
                path: prdFile,
                description: (frontmatter.description as string) || "",
              });
            }
          }
        }
      }
    }
  } catch {
    // PRD dir not found
  }

  return {
    skills,
    playbooks,
    relatedPrds,
    graphStats: {
      totalNodes: 0, // Populated by graph query
      totalEdges: 0,
      relevantNodes: skills.length + playbooks.length + relatedPrds.length,
    },
  };
}

/**
 * Format knowledge context as a prompt injection for the coding agent
 */
export function formatKnowledgeContext(context: KnowledgeContext): string {
  const lines: string[] = [];

  lines.push("## KNOWLEDGE CONTEXT (NEPTUNE-KNOWLEDGE-SPEC v1.0)");
  lines.push("");

  if (context.playbooks.length > 0) {
    lines.push("### Relevant Playbooks");
    lines.push("");
    for (const playbook of context.playbooks) {
      lines.push(`**${playbook.name}** (${playbook.domain} v${playbook.version})`);
      lines.push(`- ${playbook.description}`);
      if (playbook.connectors.length > 0) {
        lines.push(`- Connectors: ${playbook.connectors.join(", ")}`);
      }
      if (playbook.procedures.length > 0) {
        lines.push(`- Key procedures: ${playbook.procedures.slice(0, 5).join(", ")}`);
      }
      lines.push("");
    }
  }

  if (context.skills.length > 0) {
    lines.push("### Relevant Skills");
    lines.push("");
    for (const skill of context.skills) {
      lines.push(`- **${skill.name}** (${skill.domain} v${skill.version}) — ${skill.description}`);
    }
    lines.push("");
  }

  if (context.relatedPrds.length > 0) {
    lines.push("### Related PRDs");
    lines.push("");
    for (const prd of context.relatedPrds) {
      lines.push(`- **${prd.name}** — ${prd.description}`);
    }
    lines.push("");
  }

  lines.push("Use this context to align your implementation with Neptune conventions.");
  lines.push("");

  return lines.join("\n");
}

/**
 * Quick function: load and format context for a task
 */
export function getContextForTask(task: string): string {
  const context = loadKnowledgeContext(task);
  return formatKnowledgeContext(context);
}
