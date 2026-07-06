import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import withFlowbiteReact from "flowbite-react/plugin/nextjs";

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin the file-tracing root to this package. Without this, Next walks up
  // looking for a lockfile and — on machines with a stray lockfile in a
  // parent directory (e.g. the user's home dir) — infers a false monorepo
  // root, which nests the standalone server under that root's relative path
  // instead of producing .next/standalone/server.js directly.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default withFlowbiteReact(nextConfig);