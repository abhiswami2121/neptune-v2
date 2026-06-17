/**
 * Knowledge Sync API — V2 ↔ Chat knowledge sync
 *
 * Syncs knowledge context between V2 and Chat apps.
 * V2 can pull the latest NKS files and push back skill modifications.
 *
 * NEPTUNE-KNOWLEDGE-SPEC v1.0 — Reference Implementation
 * Phase 43: V2 Coding Agent Maturation | Stream 9
 */

import { NextResponse } from "next/server";
import { loadKnowledgeContext, formatKnowledgeContext } from "@/lib/knowledge/load-okf-bundle";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const task = searchParams.get("task") || "";
  const format = searchParams.get("format") || "json";

  try {
    const context = loadKnowledgeContext(task);

    if (format === "prompt") {
      const promptContext = formatKnowledgeContext(context);
      return NextResponse.json({ prompt: promptContext, context });
    }

    return NextResponse.json({
      success: true,
      context: {
        skills: context.skills.map((s) => ({
          name: s.name,
          domain: s.domain,
          version: s.version,
          description: s.description,
        })),
        playbooks: context.playbooks.map((p) => ({
          name: p.name,
          domain: p.domain,
          version: p.version,
          description: p.description,
          procedures: p.procedures,
          connectors: p.connectors,
        })),
        relatedPrds: context.relatedPrds,
        stats: context.graphStats,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message,
      },
      { status: 500 }
    );
  }
}

/**
 * POST: V2 writes back to Chat's knowledge layer (selfCode)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, path, content, reason } = body;

    if (!action || !path) {
      return NextResponse.json(
        { success: false, error: "action and path required" },
        { status: 400 }
      );
    }

    // SCAFFOLD — Phase 43 fills in actual selfCode implementation
    // This would:
    // 1. Validate the target path is in cortex/ (not outside)
    // 2. Check NMI SACRED boundaries (never write to NMI files)
    // 3. Write the file
    // 4. Git commit with agent attribution
    // 5. Update log.md
    // 6. Trigger Graphify/Graphiti reindex

    const actions: string[] = [];

    switch (action) {
      case "write_skill":
        actions.push(`Skill write to ${path}: scaffolded`);
        break;
      case "update_skill":
        actions.push(`Skill update: ${path}: scaffolded`);
        break;
      case "add_procedure":
        actions.push(`Procedure added to ${path}: scaffolded`);
        break;
      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      actions,
      reason: reason || "scaffold",
      message: "Self-code scaffolded — full implementation in Phase 43",
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
