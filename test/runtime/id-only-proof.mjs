import { mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import process from "node:process";
import { TextDecoder } from "node:util";
import { build } from "esbuild";

const runtimeRoot = import.meta.dirname;
const packageRoot = resolve(runtimeRoot, "../..");
const repositoryRoot = resolve(packageRoot, "../..");
const stateRoot = resolve(
  repositoryRoot,
  ".botanical/cairn-runtime-proof/id-only",
);
const maximumMetafileInputs = 128;
const maximumOutputFiles = 8;
const maximumTotalOutputBytes = 1_000_000;

function normalize(path) {
  return path.split(sep).join("/");
}

function isStrictlyInside(parent, candidate) {
  const child = relative(parent, candidate);
  return child !== "" && !child.startsWith(`..${sep}`) && child !== "..";
}

function manifestImportTarget(manifest, key) {
  const target = manifest?.exports?.[key]?.import;
  if (
    target?.constructor !== String ||
    target.length < 1 ||
    target.length > 256 ||
    !target.startsWith("./dist/")
  ) {
    throw new Error(`${key} has an invalid bounded public import target`);
  }
  return target;
}

async function resolvePublicImportTarget(manifest, key, realDistributionRoot) {
  const declared = manifestImportTarget(manifest, key);
  const lexicalPath = resolve(packageRoot, declared);
  const realPath = await realpath(lexicalPath);
  const information = await stat(realPath);
  if (!information.isFile()) {
    throw new Error(`${key} public import target is not a file`);
  }
  if (!isStrictlyInside(realDistributionRoot, realPath)) {
    throw new Error(`${key} public import target escapes Cairn dist`);
  }
  return { declared, realPath };
}

async function realMetafileInput(input) {
  const lexicalPath = isAbsolute(input)
    ? input
    : resolve(repositoryRoot, input);
  return { input: normalize(input), realPath: await realpath(lexicalPath) };
}

async function runProof() {
  await rm(stateRoot, { recursive: true, force: true });
  await mkdir(stateRoot, { recursive: true });

  const manifest = JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  );
  const [realDistributionRoot, realSourceRoot] = await Promise.all([
    realpath(resolve(packageRoot, "dist")),
    realpath(resolve(packageRoot, "src")),
  ]);
  const [publicId, publicRoot, publicWords] = await Promise.all([
    resolvePublicImportTarget(manifest, "./id", realDistributionRoot),
    resolvePublicImportTarget(manifest, ".", realDistributionRoot),
    resolvePublicImportTarget(manifest, "./words", realDistributionRoot),
  ]);

  const result = await build({
    absWorkingDir: repositoryRoot,
    bundle: true,
    conditions: ["browser", "import", "default"],
    entryPoints: [resolve(runtimeRoot, "id-only-entry.mjs")],
    format: "esm",
    logLevel: "silent",
    metafile: true,
    platform: "browser",
    treeShaking: true,
    write: false,
    plugins: [
      {
        name: "resolve-built-cairn-public-id",
        setup(buildContext) {
          buildContext.onResolve(
            { filter: /^@fungi\.computer\/cairn\/id$/ },
            () => ({ path: publicId.realPath }),
          );
        },
      },
    ],
  });
  if (!result.metafile) throw new Error("esbuild did not return a metafile");

  const inputNames = Object.keys(result.metafile.inputs);
  if (inputNames.length > maximumMetafileInputs) {
    throw new Error(
      `esbuild metafile exceeded ${String(maximumMetafileInputs)} inputs`,
    );
  }
  const inputs = await Promise.all(inputNames.map(realMetafileInput));
  inputs.sort((left, right) => left.input.localeCompare(right.input));
  const selectedInput = inputs.find(
    ({ realPath }) => realPath === publicId.realPath,
  );
  if (!selectedInput) {
    throw new Error(
      `metafile omitted manifest-selected ID entry ${publicId.declared}`,
    );
  }

  const forbiddenInputs = inputs.filter(
    ({ input, realPath }) =>
      realPath === publicRoot.realPath ||
      realPath === publicWords.realPath ||
      isStrictlyInside(realSourceRoot, realPath) ||
      /(?:^|\/)(?:adjectives|nouns|word-corpus)(?:\.|\/|$)/i.test(input),
  );
  if (forbiddenInputs.length > 0) {
    throw new Error(
      `ID-only bundle reached forbidden Cairn inputs: ${JSON.stringify(forbiddenInputs.map(({ input }) => input))}`,
    );
  }

  if (result.outputFiles.length > maximumOutputFiles) {
    throw new Error(
      `esbuild exceeded ${String(maximumOutputFiles)} output files`,
    );
  }
  const totalOutputBytes = result.outputFiles.reduce(
    (total, file) => total + file.contents.byteLength,
    0,
  );
  if (totalOutputBytes > maximumTotalOutputBytes) {
    throw new Error(
      `esbuild output exceeded ${String(maximumTotalOutputBytes)} bytes`,
    );
  }
  const output = result.outputFiles
    .map((file) => new TextDecoder().decode(file.contents))
    .join("\n");
  const corpusSentinels = [
    "chanterelle",
    "fruitingbody",
    "microdosed",
    "sporeladen",
  ].filter((sentinel) => output.includes(sentinel));
  if (corpusSentinels.length > 0) {
    throw new Error(
      `ID-only bundle contains word-corpus sentinels: ${JSON.stringify(corpusSentinels)}`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      proof: "cairn-id-only-esbuild",
      entry: publicId.declared,
      inputs: inputs.length,
      outputBytes: totalOutputBytes,
      verdict: "pass",
    })}\n`,
  );
}
const outcomes = await Promise.allSettled([runProof()]);

outcomes.push(
  ...(await Promise.allSettled([
    rm(stateRoot, { recursive: true, force: true }),
  ])),
);
const failures = outcomes.flatMap((outcome) =>
  outcome.status === "rejected" ? [outcome.reason] : [],
);
if (failures.length > 0)
  throw new AggregateError(failures, "Cairn ID-only proof or cleanup failed");
