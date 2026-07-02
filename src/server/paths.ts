import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

/**
 * The package root, given `src/cli.ts`'s `import.meta.url`. `cli.ts` lives at
 * `<packageRoot>/src/cli.ts`, so the root is two directories up. Used so the CLI
 * can spawn `next start` from the package's own directory (where `.next` lives)
 * even when invoked from an arbitrary project's working directory.
 */
export function packageRootFrom(cliModuleUrl: string): string {
  return dirname(dirname(fileURLToPath(cliModuleUrl)));
}
