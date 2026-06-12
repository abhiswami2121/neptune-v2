/**
 * lib/auth/allowlist.ts — Canonical ALLOWED_EMAILS list for Neptune V2.
 *
 * PHASE 2: Auth Allowlist Gate
 * Only these two users can access Neptune V2. All guest/non-allowlisted access
 * is redirected to /access-denied. This is the single source of truth —
 * referenced by auth callbacks and API route guards.
 *
 * LOCKED: Do not add emails here without explicit approval from Abhi or Jerry.
 */

export const ALLOWED_EMAILS: readonly string[] = [
  "abhiswami2121@gmail.com",
  "jerry.b.yirenkyi@gmail.com",
] as const;

export type AllowedEmail = (typeof ALLOWED_EMAILS)[number];

/** Check if an email (case-insensitive) is in the allowlist */
export function isAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return ALLOWED_EMAILS.some((allowed) => allowed.toLowerCase() === normalized);
}
