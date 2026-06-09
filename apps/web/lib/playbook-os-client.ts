// ============================================================
// Playbook OS V2 — Neptune V2 Adapter (TypeScript)
// Backend client for neptune-v2 Next.js app.
//
// Replaces the V1 skill-router with full PlaybookOS SDK.
// All tool calls go through hardening + durable wrappers.
// OpenSpace metrics feed into v2-coding-agent-grader scoring.
// ============================================================

// Note: In production, this is imported from the playbook-os package.
// For now, it uses a dynamic import pattern to avoid hard dependency.

export interface NeptuneV2PlaybookConfig {
  repoPath?: string;
  agent?: string;
}

export interface SkillEffectiveness {
  skillId: string;
  skillName: string;
  effectiveRate: number;
  appliedRate: number;
  completionRate: number;
  fallbackRate: number;
  totalSelections: number;
}

export interface ToolHealth {
  toolId: string;
  toolName: string;
  integrationName: string;
  successRate: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  failureCount: number;
  flaggedCount: number;
}

let _playbookOS: any = null;
let _config: NeptuneV2PlaybookConfig = {};

/**
 * Lazy-load the Playbook OS SDK.
 * In production, this is a direct import. The dynamic import
 * pattern ensures the app doesn't crash if playbook-os isn't available.
 */
async function getPlaybookOS(): Promise<any> {
  if (_playbookOS) return _playbookOS;

  try {
    // Direct import — the playbook-os package should be installed
    const { PlaybookOS } = await import('playbook-os');
    _playbookOS = new PlaybookOS({
      repoPath: _config.repoPath || '/home/neptune/playbook-os',
      agent: _config.agent || 'neptune-v2',
    });
    return _playbookOS;
  } catch {
    // Fallback: return a no-op implementation
    console.warn('[PlaybookOS] SDK not available — using no-op adapter');
    return createNoopAdapter();
  }
}

function createNoopAdapter() {
  return {
    discover: async () => ({ classification: {}, skills: [], playbooks: [], integrations: [] }),
    recordOutcome: async () => {},
    metrics: {
      getSkillEffectiveness: () => null,
      getToolHealth: () => null,
      getAllSkillMetrics: () => [],
      getAllToolMetrics: () => [],
      recordToolCall: () => {},
      registerSkill: () => {},
      recordSkillSelection: () => {},
    },
    quality: {
      scan: () => ({ alerts: [] }),
      getHealthSummary: () => ({ healthy: true, warnings: [] }),
    },
    evolution: {
      runCycle: async () => ({ suggestions: [] }),
    },
    dashboard: {
      build: () => ({}),
      health: () => ({ healthy: true }),
    },
    hardening: {
      harden: (fn: Function) => fn,
    },
  };
}

/**
 * Initialize the Playbook OS adapter.
 */
export async function initPlaybookOS(config: NeptuneV2PlaybookConfig = {}): Promise<void> {
  _config = config;
  const pos = await getPlaybookOS();
  console.log(`[PlaybookOS] Initialized for agent: ${pos.agentName || config.agent}`);
}

/**
 * Discover skills + playbooks + hardening for a task.
 * Returns context for the agent's system prompt.
 */
export async function discoverForTask(
  prompt: string,
  repo?: string,
): Promise<{
  classification: any;
  skills: any[];
  playbooks: any[];
  hardeningSkills: any[];
  integrations: string[];
}> {
  const pos = await getPlaybookOS();
  const context = await pos.discover({ prompt, repo });

  // V2: Also get relevant hardening sub-skills
  const hardeningSkills = context.skills?.filter(
    (s: any) => s.cluster === 'integration-hardening'
  ) || [];

  return {
    classification: context.classification,
    skills: context.skills || [],
    playbooks: context.playbooks || [],
    hardeningSkills,
    integrations: context.integrations || [],
  };
}

/**
 * Record a task outcome with full OpenSpace metrics.
 */
export async function recordTaskOutcome(params: {
  taskId: string;
  success: boolean;
  durationMs: number;
  tokensUsed?: number;
  skillsLoaded?: string[];
  playbooksLoaded?: string[];
  integration?: string;
  retries?: number;
  errorMessage?: string;
}): Promise<void> {
  const pos = await getPlaybookOS();
  await pos.recordOutcome({
    task_id: params.taskId,
    success: params.success,
    duration_ms: params.durationMs,
    tokens_used: params.tokensUsed || 0,
    skills_loaded: params.skillsLoaded || [],
    playbooks_loaded: params.playbooksLoaded || [],
    integration: params.integration,
    retries: params.retries || 0,
    first_try: params.retries ? params.retries === 0 : true,
    error_message: params.errorMessage,
  });
}

/**
 * Get skill effectiveness for the grader.
 * Returns null-safe metrics for any skill.
 */
export async function getSkillEffectiveness(
  skillName: string,
): Promise<SkillEffectiveness | null> {
  const pos = await getPlaybookOS();
  const metrics = pos.metrics.getSkillEffectiveness(skillName);
  if (!metrics) return null;

  return {
    skillId: metrics.skillId,
    skillName: metrics.skillName,
    effectiveRate: metrics.effectiveRate,
    appliedRate: metrics.appliedRate,
    completionRate: metrics.completionRate,
    fallbackRate: metrics.fallbackRate,
    totalSelections: metrics.totalSelections,
  };
}

/**
 * Get tool health for monitoring.
 */
export async function getToolHealth(
  toolName: string,
): Promise<ToolHealth | null> {
  const pos = await getPlaybookOS();
  const health = pos.metrics.getToolHealth(toolName);
  if (!health) return null;

  return {
    toolId: health.toolId,
    toolName: health.toolName,
    integrationName: health.integrationName,
    successRate: health.successRate,
    avgLatencyMs: health.avgLatencyMs,
    p95LatencyMs: health.p95LatencyMs,
    failureCount: health.failureCount,
    flaggedCount: health.flaggedCount,
  };
}

/**
 * Compute a grader score adjustment based on skill effectiveness.
 *
 * If the skill used has a high effective rate, bonus points.
 * If the skill has high fallback rate, penalty points.
 */
export async function computeGraderAdjustment(
  skillsUsed: string[],
): Promise<{ bonusPoints: number; penaltyPoints: number; details: any[] }> {
  const pos = await getPlaybookOS();
  let bonusPoints = 0;
  let penaltyPoints = 0;
  const details: any[] = [];

  for (const skillName of skillsUsed) {
    const metrics = pos.metrics.getSkillEffectiveness(skillName);
    if (!metrics) continue;

    if (metrics.effectiveRate >= 0.8) {
      bonusPoints += 2;
      details.push({ skill: skillName, adjustment: '+2', reason: 'High effectiveness' });
    } else if (metrics.effectiveRate <= 0.3 && metrics.totalSelections >= 5) {
      penaltyPoints += 1;
      details.push({ skill: skillName, adjustment: '-1', reason: 'Low effectiveness' });
    }

    if (metrics.fallbackRate >= 0.5 && metrics.totalSelections >= 5) {
      penaltyPoints += 2;
      details.push({ skill: skillName, adjustment: '-2', reason: 'High fallback rate' });
    }
  }

  return { bonusPoints, penaltyPoints, details };
}

/**
 * Harden a tool function through the Playbook OS pipeline.
 * Applies: timeout + retry + circuit-breaker + audit + LLM-friendly errors.
 */
export async function hardenTool<TInput, TOutput>(
  toolName: string,
  integrationName: string,
  handler: (input: TInput) => Promise<TOutput>,
): Promise<(input: TInput) => Promise<TOutput>> {
  const pos = await getPlaybookOS();
  return pos.hardening.harden(handler, toolName, integrationName);
}

// Export for direct use
export { getPlaybookOS };
export default { initPlaybookOS, discoverForTask, recordTaskOutcome, getSkillEffectiveness, getToolHealth, computeGraderAdjustment, hardenTool };
