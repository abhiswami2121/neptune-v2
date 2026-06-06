import { ThemeToggle } from "./theme-toggle";

export function LandingFooter() {
  return (
    <footer>
      <div className="mx-auto max-w-[1320px] md:border-t md:border-(--l-border)">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4">
          <div className="px-6 pt-14 md:px-10 md:py-18">
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
              Neptune Code
            </div>
            <div className="mt-3 text-sm text-(--l-fg-2)">
              The coding agent that ships.
            </div>
          </div>

          <div className="hidden lg:block" />

          <div className="px-6 pt-14 md:px-10 md:py-18">
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
              Product
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="https://neptune-v2.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                Neptune Code
              </a>
              <a
                href="https://github.com/abhiswami2121/neptune-v2"
                target="_blank"
                rel="noopener noreferrer"
                className="font-sans text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                GitHub
              </a>
              <a
                href="/get-started"
                className="font-sans text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                Get Started
              </a>
            </div>
          </div>

          <div className="px-6 pt-14 md:px-10 md:py-18">
            <div className="font-mono text-xs uppercase tracking-widest text-(--l-fg-3)">
              Links
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="/privacy"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                Privacy
              </a>
              <a
                href="/terms"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                Terms
              </a>
              <a
                href="/status"
                className="text-sm text-(--l-fg-2) transition-colors hover:text-(--l-fg)"
              >
                Status
              </a>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 pt-6 pb-6 md:pt-0 md:px-10 md:pb-10">
          <span className="text-sm text-(--l-fg-3)">
            Neptune &copy; 2026 NewLeaf Financial
          </span>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
