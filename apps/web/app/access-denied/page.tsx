import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Access Denied — Neptune V2",
};

export default function AccessDeniedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-dvh bg-background px-4">
      <div className="flex flex-col items-center text-center max-w-md">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-red-50 dark:bg-red-950/30 ring-1 ring-red-200 dark:ring-red-800 mb-6">
          <ShieldAlert size={32} className="text-red-500" />
        </div>

        <h1 className="text-2xl font-bold mb-2">Access Denied</h1>

        <p className="text-muted-foreground mb-4">
          Neptune V2 is currently in private beta. Access is restricted to
          authorized users only.
        </p>

        <div className="bg-muted/50 rounded-xl border px-4 py-3 mb-6 w-full">
          <p className="text-sm text-muted-foreground">
            If you believe you should have access, please contact the
            administrators at{" "}
            <span className="font-mono text-xs">abhiswami2121@gmail.com</span>
            {" "}or{" "}
            <span className="font-mono text-xs">jerry.b.yirenkyi@gmail.com</span>.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to Home
        </Link>
      </div>
    </div>
  );
}
