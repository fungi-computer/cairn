import { realpathSync, rmSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

import packageManifest from "../../package.json" with { type: "json" };

const runtimeRoot = import.meta.dirname;
const packageRoot = resolve(runtimeRoot, "../..");
const repositoryRoot = resolve(packageRoot, "../..");
const distributionRoot = realpathSync(resolve(packageRoot, "dist"));
const stateRoot = resolve(
  repositoryRoot,
  ".botanical/cairn-runtime-proof/workerd",
);
const publicIdImport = packageManifest.exports["./id"]?.import;
if (publicIdImport === undefined) {
  throw new Error("Cairn package manifest has no ./id import target");
}
const publicIdTarget = realpathSync(resolve(packageRoot, publicIdImport));
const publicIdRelativePath = relative(distributionRoot, publicIdTarget);
if (
  publicIdRelativePath === "" ||
  publicIdRelativePath === ".." ||
  publicIdRelativePath.startsWith(`..${sep}`) ||
  isAbsolute(publicIdRelativePath) ||
  !publicIdRelativePath.endsWith(".js") ||
  !statSync(publicIdTarget).isFile()
) {
  throw new Error(
    "Cairn ./id import target is not a built dist JavaScript file",
  );
}

rmSync(stateRoot, { recursive: true, force: true });
process.once("exit", () => {
  rmSync(stateRoot, { recursive: true, force: true });
});

export default defineConfig({
  root: repositoryRoot,
  cacheDir: resolve(stateRoot, "vite-cache"),
  plugins: [
    {
      name: "resolve-built-cairn-public-id",
      enforce: "pre",
      resolveId(source) {
        if (source === "@fungi.computer/cairn/id") return publicIdTarget;
        return undefined;
      },
    },
    cloudflareTest({}),
  ],
  test: {
    include: [resolve(runtimeRoot, "workerd-proof.mjs")],
    testTimeout: 15_000,
  },
});
