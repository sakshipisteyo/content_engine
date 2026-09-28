/** @type {import('next').NextConfig} */
const nextConfig = {
  // Files the serverless functions read or run at request time. Paths are relative to
  // apps/review. The engine bundle (.engine/, built by scripts/build-engine.mjs) is
  // spawned by the API routes and needs sharp's native binary for Vercel's linux-x64.
  outputFileTracingIncludes: {
    "/**": [
      "../../pnpm-workspace.yaml",
      "../../out/**",
      "../../briefs/**",
      "../../data/**",
      "../../brand/**",
      "../../templates/**",
      "../../prompts/**",
      "../../routing/**",
      "../../assets/fonts/**",
      "./.engine/**",
      "../../node_modules/sharp/**",
      "../../node_modules/@img/colour/**",
      "../../node_modules/@img/sharp-linux-x64/**",
      "../../node_modules/@img/sharp-libvips-linux-x64/**",
      "../../node_modules/detect-libc/**",
      "../../node_modules/semver/**",
    ],
  },
  serverExternalPackages: ["@neondatabase/serverless"],
};
export default nextConfig;
