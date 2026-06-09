import { NextResponse } from "next/server";

export async function GET() {
  const tasks = globalThis.__handoffTasks || [];
  const sorted = [...tasks].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return NextResponse.json({ tasks: sorted, total: sorted.length });
}
