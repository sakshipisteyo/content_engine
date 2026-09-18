/** @type {import('next').NextConfig} */
const nextConfig = {
  // The board reads out/ and data/ledger.sqlite directly (fs + node:sqlite via
  // process.getBuiltinModule), so no special bundling config is needed.
};
export default nextConfig;
