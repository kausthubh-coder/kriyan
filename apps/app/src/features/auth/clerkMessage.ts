// Clerk's results carry an error or null; these turn one into a sentence for the person.

interface ClerkError {
  message?: string;
  longMessage?: string;
  errors?: { code?: string; longMessage?: string; message?: string }[];
}

interface ClerkResult {
  error: ClerkError | null;
}

function errorOf(result: ClerkResult | unknown): ClerkError | null {
  return (result as ClerkResult | undefined)?.error ?? (result instanceof Error ? result : null);
}

/** What went wrong, in Clerk's words, or `fallback` when it didn't say; null when nothing did. */
export function clerkMessage(result: ClerkResult | unknown, fallback: string): string | null {
  const error = errorOf(result);
  if (!error) return null;
  const first = error.errors?.[0];
  return first?.longMessage ?? first?.message ?? error.longMessage ?? error.message ?? fallback;
}

/** Clerk's machine-readable code for the first error, like "form_identifier_not_found". */
export function clerkCode(result: ClerkResult | unknown): string | null {
  return errorOf(result)?.errors?.[0]?.code ?? null;
}
