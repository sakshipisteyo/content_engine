/** @type {import('next').NextConfig} */
const nextConfig = {
  // Include out/, brand/, briefs/ data files in the serverless bundle
  outputFileTracingIncludes: {
    "/**": ["../../out/**", "../../brand/**", "../../briefs/**", "../../pnpm-workspace.yaml"],
  },
  serverExternalPackages: ["@neondatabase/serverless"],
};
export default nextConfig;
