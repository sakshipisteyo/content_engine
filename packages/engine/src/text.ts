/** Tiny template helper shared by compile + score. Prompt text stays in YAML. */
export function interpolate(template: string, tokens: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) =>
      key in tokens ? tokens[key] ?? "" : "",
    )
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}
