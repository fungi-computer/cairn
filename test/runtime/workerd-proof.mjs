import { expect, it } from "vitest";
import * as CairnIdentifier from "@fungi.computer/cairn/id";

import { assertIdentifierRuntime } from "./identifier-runtime-law.mjs";

it("imports the public Cairn identifier subpath in native Workerd", () => {
  const result = assertIdentifierRuntime(CairnIdentifier);

  expect(result.parsed).toBe("machine_0123456789abcdefghijk");
  expect(result.generated).toMatch(/^machine_[a-z0-9]{21}$/);
});
