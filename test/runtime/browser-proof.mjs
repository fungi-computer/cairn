import { createRequire } from "node:module";
import { createServer } from "node:http";
import { access, mkdir, readFile, realpath, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import process from "node:process";
import { URL } from "node:url";

import { build } from "esbuild";
import { chromium } from "playwright";

const runtimeRoot = import.meta.dirname;
const packageRoot = resolve(runtimeRoot, "../..");
const repositoryRoot = resolve(packageRoot, "../..");
const distributionRoot = resolve(packageRoot, "dist");
const stateRoot = resolve(
  repositoryRoot,
  ".botanical/cairn-runtime-proof/browser",
);
const maximumRequests = 256;
const maximumRequestUrlCharacters = 2_048;
const maximumModuleBytes = 2_000_000;
const maximumDependencies = 8;
const maximumBrowserErrors = 32;
const maximumBrowserErrorCharacters = 2_048;

function isStrictlyInside(parent, candidate) {
  const child = relative(parent, candidate);
  return child !== "" && !child.startsWith(`..${sep}`) && child !== "..";
}

async function requireFile(path, purpose) {
  await access(path);
  const information = await stat(path);
  if (!information.isFile())
    throw new Error(`${purpose} is not a file: ${path}`);
  if (information.size > maximumModuleBytes) {
    throw new Error(`${purpose} exceeds ${maximumModuleBytes} bytes: ${path}`);
  }
  return path;
}

async function dependencyRoute(dependency, index) {
  const requireFromCairn = createRequire(resolve(packageRoot, "package.json"));
  const manifestPath = requireFromCairn.resolve(`${dependency}/package.json`);
  const dependencyRoot = dirname(manifestPath);
  let entry;
  await build({
    stdin: {
      contents: `import ${JSON.stringify(dependency)};`,
      resolveDir: packageRoot,
    },
    bundle: true,
    platform: "browser",
    write: false,
    plugins: [
      {
        name: "resolve-public-browser-entry",
        setup(builder) {
          builder.onResolve({ filter: /^[^./]/ }, async (args) => {
            if (args.pluginData === "resolved") return;
            const result = await builder.resolve(args.path, {
              resolveDir: args.resolveDir,
              kind: args.kind,
              pluginData: "resolved",
            });
            if (result.errors.length) return { errors: result.errors };
            entry = result.path;
            return { path: result.path, external: true };
          });
        },
      },
    ],
  });
  if (!entry) throw new Error(`No browser entry resolved for ${dependency}`);
  await requireFile(entry, `${dependency} browser entry`);

  return {
    dependency,
    root: dependencyRoot,
    prefix: `/dependencies/${String(index)}/`,
    entry,
  };
}

function contentType(path) {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/javascript; charset=utf-8";
}

let context;
let server;
const requestFailures = [];
async function runProof() {
  await rm(stateRoot, { recursive: true, force: true });
  await mkdir(stateRoot, { recursive: true });

  const manifest = JSON.parse(
    await readFile(resolve(packageRoot, "package.json"), "utf8"),
  );
  const publicIdDeclaration = manifest?.exports?.["./id"]?.import;
  if (
    publicIdDeclaration?.constructor !== String ||
    publicIdDeclaration.length < 1 ||
    publicIdDeclaration.length > 256 ||
    !publicIdDeclaration.startsWith("./dist/")
  ) {
    throw new Error("the public ID entry has an invalid bounded target");
  }
  const realDistributionRoot = await realpath(distributionRoot);
  const publicIdTarget = await requireFile(
    await realpath(resolve(packageRoot, publicIdDeclaration)),
    "manifest-selected Cairn ID entry",
  );
  if (!isStrictlyInside(realDistributionRoot, publicIdTarget)) {
    throw new Error("the public ID entry escapes real Cairn dist");
  }

  const dependencyNames = Object.keys(manifest.dependencies ?? {}).sort();
  if (dependencyNames.length > maximumDependencies) {
    throw new Error(
      `Cairn browser proof exceeds ${String(maximumDependencies)} dependencies`,
    );
  }
  const dependencies = await Promise.all(dependencyNames.map(dependencyRoute));
  const importMap = {
    imports: {
      "@fungi.computer/cairn/id": `/cairn/${relative(
        realDistributionRoot,
        publicIdTarget,
      )}`,
      ...Object.fromEntries(
        dependencies.flatMap(({ dependency, entry, prefix, root }) => [
          [dependency, `${prefix}${relative(root, entry)}`],
          [`${dependency}/`, prefix],
        ]),
      ),
    },
  };
  const html = `<!doctype html><meta charset="utf-8"><script type="importmap">${JSON.stringify(
    importMap,
  )}</script><script type="module" src="/proof/browser-entry.mjs"></script>`;
  const fixedRoutes = new Map([
    ["/", { contents: html, path: "proof.html" }],
    [
      "/proof/browser-entry.mjs",
      { path: resolve(runtimeRoot, "browser-entry.mjs") },
    ],
    [
      "/proof/identifier-runtime-law.mjs",
      { path: resolve(runtimeRoot, "identifier-runtime-law.mjs") },
    ],
  ]);
  const seenRequests = [];
  let requestCountOverflow = false;
  let requestUrlOverflow = false;

  server = createServer(async (request, response) => {
    try {
      if (seenRequests.length >= maximumRequests) {
        requestCountOverflow = true;
        response.writeHead(429).end("request bound exceeded");
        return;
      }
      const requestUrl = request.url ?? "";
      if (requestUrl.length > maximumRequestUrlCharacters) {
        requestUrlOverflow = true;
        seenRequests.push(requestUrl.slice(0, maximumRequestUrlCharacters));
        response.writeHead(414).end("request URL bound exceeded");
        return;
      }
      seenRequests.push(requestUrl);

      const pathname = new URL(request.url ?? "/", "http://proof.invalid")
        .pathname;
      const fixed = fixedRoutes.get(pathname);
      if (fixed) {
        const body =
          "contents" in fixed
            ? fixed.contents
            : await readFile(await requireFile(fixed.path, pathname));
        response
          .writeHead(200, { "content-type": contentType(fixed.path) })
          .end(body);
        return;
      }

      if (pathname.startsWith("/cairn/")) {
        const file = resolve(
          realDistributionRoot,
          pathname.slice("/cairn/".length),
        );
        if (!isStrictlyInside(realDistributionRoot, file))
          throw new Error("invalid dist path");
        const realFile = await realpath(file);
        if (!isStrictlyInside(realDistributionRoot, realFile)) {
          throw new Error("Cairn module escapes real dist");
        }
        response
          .writeHead(200, { "content-type": contentType(realFile) })
          .end(await readFile(await requireFile(realFile, "Cairn module")));
        return;
      }

      const dependency = dependencies.find(({ prefix }) =>
        pathname.startsWith(prefix),
      );
      if (dependency) {
        const file = resolve(
          dependency.root,
          pathname.slice(dependency.prefix.length),
        );
        if (!isStrictlyInside(dependency.root, file)) {
          throw new Error("invalid dependency path");
        }
        response
          .writeHead(200, { "content-type": contentType(file) })
          .end(await readFile(await requireFile(file, "dependency module")));
        return;
      }

      response.writeHead(404).end("not found");
    } catch (cause) {
      requestFailures.push({ cause });
      response.writeHead(500).end("proof server failure");
    }
  });

  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  const address = server.address();
  const port = address?.port;
  if (!Number.isInteger(port)) {
    throw new Error("browser proof server did not expose a TCP port");
  }

  context = await chromium.launchPersistentContext(
    resolve(stateRoot, "profile"),
    {
      headless: true,
    },
  );
  const page = await context.newPage();
  const browserErrors = [];
  let browserErrorOverflow = false;
  function retainBrowserError(message) {
    if (browserErrors.length >= maximumBrowserErrors) {
      browserErrorOverflow = true;
      return;
    }
    browserErrors.push(message.slice(0, maximumBrowserErrorCharacters));
  }
  page.on("pageerror", (error) => retainBrowserError(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") retainBrowserError(message.text());
  });
  await page.goto(`http://127.0.0.1:${String(port)}/`, {
    waitUntil: "load",
    timeout: 15_000,
  });
  await page.waitForFunction(
    () => "__cairnIdentifierBrowserProof" in globalThis,
    undefined,
    { timeout: 15_000 },
  );
  const result = await page.evaluate(
    () => globalThis.__cairnIdentifierBrowserProof,
  );
  if (
    !result?.ok ||
    browserErrors.length > 0 ||
    browserErrorOverflow ||
    requestCountOverflow ||
    requestUrlOverflow
  ) {
    throw new Error(
      `native browser law failed: ${JSON.stringify({ result, browserErrors, browserErrorOverflow, requestCountOverflow, requestUrlOverflow })}`,
    );
  }

  const expectedPublicRequest = `/cairn/${relative(
    realDistributionRoot,
    publicIdTarget,
  )}`;
  if (!seenRequests.includes(expectedPublicRequest)) {
    throw new Error(`browser did not request ${expectedPublicRequest}`);
  }
  if (seenRequests.some((request) => request.includes("/src/"))) {
    throw new Error("browser proof loaded a Cairn source path");
  }

  process.stdout.write(
    `${JSON.stringify({
      proof: "cairn-native-browser",
      entry: publicIdDeclaration,
      requests: seenRequests.length,
      verdict: "pass",
    })}\n`,
  );
}
const outcomes = await Promise.allSettled([runProof()]);

async function attemptCleanup(purpose, cleanup) {
  outcomes.push(
    ...(await Promise.allSettled([
      (async () => {
        try {
          await cleanup();
        } catch (cause) {
          throw new Error(purpose, { cause });
        }
      })(),
    ])),
  );
}

if (context) {
  await attemptCleanup("close browser context", () => context.close());
}
if (server?.listening) {
  await attemptCleanup(
    "close browser proof server",
    () =>
      new Promise((accept, reject) => {
        server.close((error) => (error ? reject(error) : accept()));
      }),
  );
}
await attemptCleanup("remove browser proof state", () =>
  rm(stateRoot, { recursive: true, force: true }),
);

const failures = [
  ...outcomes.flatMap((outcome) =>
    outcome.status === "rejected" ? [outcome.reason] : [],
  ),
  ...requestFailures.map(
    ({ cause }) => new Error("Browser proof request failed", { cause }),
  ),
];
if (failures.length > 0)
  throw new AggregateError(failures, "Cairn browser proof or cleanup failed");
