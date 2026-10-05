/** Tiny template helper shared by compile + score. Prompt text stays in YAML. */
export function interpolate(template: string, tokens: Record<string, string>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_m, key: string) =>
      key in tokens ? tokens[key] ?? "" : "",
    )
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

/** Caption with the brand's required disclaimer (e.g. legal line) appended once. */
export function withDisclaimer(caption: string, brand: { disclaimer?: string }): string {
  const d = brand.disclaimer?.trim();
  if (!d || caption.includes(d)) return caption;
  return caption.trim() ? `${caption.trim()}\n\n${d}` : d;
}
