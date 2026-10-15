import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import * as z from "zod";
import { preProcessFile } from "typescript";

import packageManifest from "../package.json" with { type: "json" };

const packageRoot = resolve(import.meta.dirname, "..");
const distributionRoot = resolve(packageRoot, "dist");
const baselineRoot = resolve(
  import.meta.dirname,
  "baselines/identifier-public-api",
);
const maximumDeclarationFiles = 64;
const publicEntries = [
  {
    key: ".",
    baseline: resolve(baselineRoot, "root.txt"),
    normalizeRootIdentifierLocator: true,
  },
  {
    key: "./id",
    baseline: resolve(baselineRoot, "id.txt"),
    normalizeRootIdentifierLocator: false,
  },
] as const;

type PublicEntryKey = (typeof publicEntries)[number]["key"];

const runtimeModuleSchema = z.looseObject({
  CairnDefinitionError: z.unknown(),
  CairnGenerationError: z.unknown(),
  defineIdFamily: z.unknown(),
  identifierCandidateSchema: z.unknown(),
  identifierDefinitionSchema: z.unknown(),
});

const rootRuntimeKeys = [
  "ADJECTIVES",
  "ALPHABET",
  "CairnDefinitionError",
  "CairnGenerationError",
  "DEFAULT",
  "LONG",
  "NOUNS",
  "SHORT",
  "correlationKey",
  "createCorrelationSequence",
  "defineIdFamily",
  "deterministicReplayKey",
  "identifierCandidateSchema",
  "identifierDefinitionSchema",
  "nanoid",
  "replayKey",
  "words",
] as const;
const identifierRuntimeKeys = [
  "CairnDefinitionError",
  "CairnGenerationError",
  "defineIdFamily",
  "identifierCandidateSchema",
  "identifierDefinitionSchema",
] as const;

function requireExactRuntimeRecord(
  value: z.infer<typeof runtimeModuleSchema>,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpectedKeys.length ||
    actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(`${label} has an unexpected runtime export inventory`);
  }
}

function isStrictlyInside(parent: string, candidate: string): boolean {
  const child = relative(parent, candidate);
  return child !== "" && !child.startsWith(`..${sep}`) && child !== "..";
}

async function publicManifestTarget(
  key: PublicEntryKey,
  field: "types" | "import",
): Promise<Readonly<{ path: string; realDistributionRoot: string }>> {
  const target = packageManifest.exports[key][field];
  expect(target, `${key} must declare a ${field} target`).toMatch(
    /^\.\/dist\//,
  );
  const [realDistributionRoot, targetPath] = await Promise.all([
    realpath(distributionRoot),
    realpath(resolve(packageRoot, target)),
  ]);
  const information = await stat(targetPath);
  expect(information.isFile(), `${key} ${field} target must be a file`).toBe(
    true,
  );
  expect(
    isStrictlyInside(realDistributionRoot, targetPath),
    `${key} ${field} target must remain strictly inside real dist`,
  ).toBe(true);
  return { path: targetPath, realDistributionRoot };
}

function normalizeRootContents(contents: string, enabled: boolean): string {
  if (!enabled) return contents;
  return contents.replaceAll('"./id.js"', '"./identifier.js"');
}

function normalizeLogicalSpecifier(
  specifier: string,
  enabled: boolean,
): string {
  return enabled && specifier === "./id.js" ? "./identifier.js" : specifier;
}

function resolveLocalDeclaration(importer: string, specifier: string): string {
  const imported = resolve(dirname(importer), specifier);
  const extension = extname(imported);
  if (imported.endsWith(".d.ts") || imported.endsWith(".d.mts"))
    return imported;
  if (extension === ".js" || extension === ".mjs") {
    return `${imported.slice(0, -extension.length)}.d${extension === ".mjs" ? ".mts" : ".ts"}`;
  }
  return `${imported}.d.ts`;
}

function assertNoDeclarationLeak(specifiers: readonly string[]) {
  for (const specifier of specifiers) {
    if (specifier.startsWith(".") && specifier !== "./input-schema.js") {
      expect(
        specifier,
        "public declarations must not reference private implementation modules",
      ).not.toMatch(
        /(?:^|\/)[^/]*(?:schema|codec|internal|private|implementation)[^/]*(?:\/|$)/i,
      );
    }
  }
}

async function serializeReachableDeclarationGraph(
  entry: string,
  realDistributionRoot: string,
  normalizeRootIdentifierLocator: boolean,
): Promise<string> {
  const visited = new Set<string>();
  const declarations: string[] = [];
  let identifierLocatorOccurrences = 0;

  async function visit(path: string, isEntry: boolean): Promise<void> {
    const realPath = await realpath(path);
    const information = await stat(realPath);
    expect(information.isFile(), "reachable declaration must be a file").toBe(
      true,
    );
    expect(
      isStrictlyInside(realDistributionRoot, realPath),
      "reachable declaration must remain strictly inside real dist",
    ).toBe(true);
    if (visited.has(realPath)) return;
    visited.add(realPath);
    expect(
      visited.size,
      "reachable declaration graph bound",
    ).toBeLessThanOrEqual(maximumDeclarationFiles);

    const emitted = await readFile(realPath, "utf8");
    identifierLocatorOccurrences += Array.from(
      emitted.matchAll(/(["'])\.\/(?:id|identifier)\.js\1/g),
    ).length;
    const preprocessed = preProcessFile(emitted, true, true);
    const specifiers = [
      ...preprocessed.importedFiles,
      ...preprocessed.referencedFiles,
      ...preprocessed.typeReferenceDirectives,
    ].map(({ fileName }) => fileName);
    assertNoDeclarationLeak(specifiers);
    declarations.push(
      normalizeRootContents(emitted, isEntry && normalizeRootIdentifierLocator),
    );

    const localDependencies = specifiers
      .filter((specifier) => specifier.startsWith("."))
      .map((specifier) => ({
        original: specifier,
        logical: normalizeLogicalSpecifier(
          specifier,
          isEntry && normalizeRootIdentifierLocator,
        ),
      }))
      .sort((left, right) => left.logical.localeCompare(right.logical));
    for (const dependency of localDependencies) {
      await visit(
        resolveLocalDeclaration(realPath, dependency.original),
        false,
      );
    }
  }

  await visit(entry, true);
  expect(
    identifierLocatorOccurrences,
    normalizeRootIdentifierLocator
      ? "the root graph must contain exactly one authorized identifier locator"
      : "the ./id graph must not contain a root identifier locator",
  ).toBe(normalizeRootIdentifierLocator ? 1 : 0);
  return declarations.join("");
}

describe("Cairn identifier public declarations", () => {
  for (const entry of publicEntries) {
    it(`keeps the normalized ${entry.key} declaration graph byte-identical`, async () => {
      const declaration = await publicManifestTarget(entry.key, "types");
      const actual = await serializeReachableDeclarationGraph(
        declaration.path,
        declaration.realDistributionRoot,
        entry.normalizeRootIdentifierLocator,
      );
      await expect(actual).toMatchFileSnapshot(entry.baseline);
    });
  }
});

it("keeps the exact root and identifier runtime value exports", async () => {
  const [rootTarget, identifierTarget] = await Promise.all([
    publicManifestTarget(".", "import"),
    publicManifestTarget("./id", "import"),
  ]);
  const rootValue: unknown = await import(pathToFileURL(rootTarget.path).href);
  const identifierValue: unknown = await import(
    pathToFileURL(identifierTarget.path).href
  );
  const rootModule = runtimeModuleSchema.parse(rootValue);
  const identifierModule = runtimeModuleSchema.parse(identifierValue);
  requireExactRuntimeRecord(rootModule, rootRuntimeKeys, "Cairn root");
  requireExactRuntimeRecord(
    identifierModule,
    identifierRuntimeKeys,
    "Cairn ./id",
  );

  expect(Object.keys(rootModule).sort()).toEqual(rootRuntimeKeys);
  expect(Object.keys(identifierModule).sort()).toEqual(identifierRuntimeKeys);
  expect(rootModule.CairnDefinitionError).toBe(
    identifierModule.CairnDefinitionError,
  );
  expect(rootModule.CairnGenerationError).toBe(
    identifierModule.CairnGenerationError,
  );
  expect(rootModule.defineIdFamily).toBe(identifierModule.defineIdFamily);
  expect(rootModule.identifierCandidateSchema).toBe(
    identifierModule.identifierCandidateSchema,
  );
  expect(rootModule.identifierDefinitionSchema).toBe(
    identifierModule.identifierDefinitionSchema,
  );
});
