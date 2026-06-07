// Augment @streamdown/code's createCodePlugin to also accept ThemeRegistration
// objects. At runtime Shiki's createHighlighter already handles this; the
// published types are just too narrow.
declare module "@streamdown/code" {
  import type { ThemeRegistration } from "@shikijs/types";
  import type { BundledTheme } from "shiki";
  import type { CodeHighlighterPlugin } from "@streamdown/code";

  // Re-export to make this a module (not ambient)
  export {};

  interface CodePluginOptions {
    themes?: [
      BundledTheme | ThemeRegistration,
      BundledTheme | ThemeRegistration,
    ];
  }

  export function createCodePlugin(
    options?: CodePluginOptions,
  ): CodeHighlighterPlugin;
}
