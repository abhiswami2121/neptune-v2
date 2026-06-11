/**
 * /api/context — Neptune V2 self-context endpoint.
 *
 * Returns V2's identity, repo, Vercel project, capabilities,
 * and sibling agent (Neptune Chat) info. Used by cross-agent awareness.
 */
import { NextResponse } from "next/server";

const V2_CONTEXT = {
  agent: "Neptune V2",
  repoUrl: "https://github.com/abhiswami2121/neptune-v2",
  repoOwner: "abhiswami2121",
  repoName: "neptune-v2",
  vercelProjectId: "prj_lEoqz6p4zgdrLlObPl845TI2ApOm",
  vercelTeamId: "team_NXlYvSlpN5mMinKXi0emQkFT",
  deployedUrl: "https://neptune-v2.vercel.app",
  stack: "Next.js 16, AI SDK 6, Better Auth, Tailwind, shadcn/ui, Vercel Sandbox SDK",
  commitAuthor: { name: "abhiswami2121", email: "abhiswami2121@gmail.com" },
  specialty: "LONG-RUNNING coding sessions — refactors, multi-file changes, building features, PR workflow",
};

export async function GET() {
  const commitSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    "unknown";

  return NextResponse.json(
    {
      ...V2_CONTEXT,
      currentCommit: commitSha,
      timestamp: new Date().toISOString(),
      capabilities: [
        "self-coding (full sandbox — no limits)",
        "sandbox-execution (Vercel Sandbox SDK)",
        "spawn-coding-agent (accepts handoffs from Neptune Chat)",
        "knowledge-retrieval (skills, memory, playbook-os)",
        "database-queries (Postgres via Neon)",
        "workflow-execution (durable multi-step workflows)",
        "artifact-generation (PRDs, docs, code)",
        "deploy-verification (poll Vercel API + smoke test)",
      ],
      siblingAgent: {
        name: "Neptune Chat",
        url: "https://neptune-chat-ashy.vercel.app",
        repo: "github.com/abhiswami2121/neptune-chat",
        vercelProjectId: "prj_bpG5ZHYNZ1wxAm7WDxr3MrBGoOBl",
        contextEndpoint: "https://neptune-chat-ashy.vercel.app/api/context",
        specialty: "Conversational AI — small self-fixes, knowledge queries, handoff to V2",
      },
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
