import * as CairnIdentifier from "@fungi.computer/cairn/id";

import { assertIdentifierRuntime } from "./identifier-runtime-law.mjs";

try {
  const result = assertIdentifierRuntime(CairnIdentifier);
  globalThis.__cairnIdentifierBrowserProof = { ok: true, result };
} catch (cause) {
  globalThis.__cairnIdentifierBrowserProof = {
    ok: false,
    error: "Cairn identifier browser law failed",
  };
  throw new Error("Cairn identifier browser law failed", { cause });
}
