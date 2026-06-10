// Type stub for playbook-os — the actual package is optional.
// Dynamic import in lib/playbook-os-client.ts gracefully falls back
// to a noop adapter when the package is not installed.
declare module 'playbook-os' {
  export class PlaybookOS {
    constructor(config?: {
      repoPath?: string;
      agent?: string;
      logDir?: string;
    });
    agentName: string;
    discover(params: { prompt: string; repo?: string }): Promise<{
      classification: { domain: string; sub_domain: string; confidence: number };
      skills: Array<{ cluster: string; name: string; file: string; score: number; tier: number; content: string }>;
      playbooks: Array<{ integration: string; content: string; sections: string[] }>;
      integrations: string[];
    }>;
    recordOutcome(params: {
      task_id: string;
      success: boolean;
      duration_ms: number;
      tokens_used: number;
      skills_loaded?: string[];
      playbooks_loaded?: string[];
    }): Promise<void>;
    metrics: {
      getSkillEffectiveness: (skillId: string) => unknown;
      getToolHealth: (toolName: string) => unknown;
      getAllSkillMetrics: () => unknown[];
      getAllToolMetrics: () => unknown[];
      recordSkillSelection: (skillName: string) => void;
      registerSkill: (skill: unknown) => void;
      getRecentEvolutions?: () => unknown[];
    };
    quality: {
      scan: () => { alerts: unknown[]; degradingSkills?: unknown[]; degradingTools?: unknown[]; integrationAlerts?: unknown[]; skillAlerts?: unknown[]; toolAlerts?: unknown[] };
      getHealthSummary: () => { healthy: boolean; warnings: string[]; metrics: Record<string, unknown> };
    };
    evolution: {
      runCycle: () => Promise<{ suggestions: unknown[] }>;
      getRecentEvolutions: () => unknown[];
      getPendingEvolutions: () => unknown[];
    };
    dashboard: {
      build: () => {
        skillCount: number;
        toolCount: number;
        integrationCount: number;
        topSkills: unknown[];
        degradingSkills: unknown[];
        degradingTools: unknown[];
        recentEvolutions: unknown[];
        globalStats: { avgEffectiveRate: number; avgSuccessRate: number; totalEvolutions: number; totalToolCalls: number; periodDays: number };
      };
      health: () => { healthy: boolean; warnings: string[]; metrics: Record<string, unknown> };
    };
    hardening: {
      harden: (fn: Function) => Function;
    };
    logs: {
      log: (entry: unknown) => string;
      flush: () => void;
      stats: () => Promise<Record<string, unknown>>;
    };
  }
}
