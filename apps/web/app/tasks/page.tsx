import type { Metadata } from "next";
import { TasksPageClient } from "./client";

export const metadata: Metadata = {
  title: "Tasks — Neptune V2",
  description: "View incoming handoff tasks from Neptune Chat",
};

export default function TasksPage() {
  return <TasksPageClient />;
}
