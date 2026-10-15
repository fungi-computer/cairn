import { webcrypto } from "node:crypto";

import { expect, expectTypeOf, it } from "vitest";

import {
  CairnDefinitionError,
  CairnGenerationError,
  defineIdFamily,
  type IdCodec,
  type IdOf,
} from "./index.js";

it("creates family-scoped codecs that generate and parse version 1 identifiers", () => {
  expect(defineIdFamily).toBeTypeOf("function");
  const machineIds = defineIdFamily({
    family: "machine",
    version: 1,
    kinds: {
      machine: { prefix: "machine" },
      lease: { prefix: "machine_lease" },
    },
  });

  expect(machineIds.machine).toMatchObject({
    family: "machine",
    kind: "machine",
    version: 1,
  });
  expect(machineIds.lease).toMatchObject({
    family: "machine",
    kind: "lease",
    version: 1,
  });
  expectTypeOf(machineIds.machine).toEqualTypeOf<
    IdCodec<"machine", "machine">
  >();
  expectTypeOf(machineIds.lease).toEqualTypeOf<IdCodec<"machine", "lease">>();
  expectTypeOf<IdOf<typeof machineIds.machine>>().not.toExtend<
    IdOf<typeof machineIds.lease>
  >();

  const machineId = machineIds.machine.generate();
  expect(machineId).toMatch(/^machine_[a-z0-9]{21}$/);
  expect(machineIds.machine.parse(machineId)).toEqual({
    ok: true,
    value: machineId,
  });
  expect(machineIds.lease.parse(machineId)).toEqual({
    ok: false,
    error: {
      code: "invalid_id",
      family: "machine",
      kind: "lease",
      version: 1,
      reason: "grammar",
    },
  });
  const leaseId = machineIds.lease.generate();
  expect(machineIds.lease.schema.parse(leaseId)).toBe(leaseId);
  expect(machineIds.machine.parse(leaseId)).toMatchObject({
    ok: false,
    error: { kind: "machine", reason: "bounds" },
  });
});

it("rejects malformed trusted declaration values with one bounded public error", () => {
  const sixtyFiveKinds: Record<string, { prefix: string }> = Object.fromEntries(
    Array.from({ length: 65 }, (_, index) => [
      `kind${String(index)}`,
      { prefix: `kind${String(index)}` },
    ]),
  );
  // Zod 4.4 records read enumerable own keys, as z.object does; a hidden
  // property is not a declared kind, so this declaration has zero kinds.
  const nonEnumerableKinds: Record<string, { prefix: string }> = {};
  Object.defineProperty(nonEnumerableKinds, "machine", {
    enumerable: false,
    value: { prefix: "machine" },
  });
  const invalidDefinitions = [
    [
      "nonempty family",
      { family: "", version: 1, kinds: { machine: { prefix: "machine" } } },
    ],
    [
      "family maximum",
      {
        family: "a".repeat(65),
        version: 1,
        kinds: { machine: { prefix: "machine" } },
      },
    ],
    [
      "family grammar",
      {
        family: "machine_family",
        version: 1,
        kinds: { machine: { prefix: "machine" } },
      },
    ],
    [
      "family ASCII",
      {
        family: "machiné",
        version: 1,
        kinds: { machine: { prefix: "machine" } },
      },
    ],
    ["one own kind", { family: "machine", version: 1, kinds: {} }],
    [
      "kinds are enumerable own entries",
      { family: "machine", version: 1, kinds: nonEnumerableKinds },
    ],
    [
      "at most 64 own kinds",
      { family: "machine", version: 1, kinds: sixtyFiveKinds },
    ],
    [
      "nonempty kind",
      { family: "machine", version: 1, kinds: { "": { prefix: "machine" } } },
    ],
    [
      "kind maximum",
      {
        family: "machine",
        version: 1,
        kinds: { ["a".repeat(65)]: { prefix: "machine" } },
      },
    ],
    [
      "kind grammar",
      {
        family: "machine",
        version: 1,
        kinds: { machine_kind: { prefix: "machine" } },
      },
    ],
    [
      "kind ASCII",
      {
        family: "machine",
        version: 1,
        kinds: { machiné: { prefix: "machine" } },
      },
    ],
    [
      "nonempty prefix",
      { family: "machine", version: 1, kinds: { machine: { prefix: "" } } },
    ],
    [
      "prefix maximum",
      {
        family: "machine",
        version: 1,
        kinds: { machine: { prefix: "a".repeat(33) } },
      },
    ],
    [
      "prefix grammar",
      {
        family: "machine",
        version: 1,
        kinds: { machine: { prefix: "machine-lease" } },
      },
    ],
    [
      "prefix ASCII",
      {
        family: "machine",
        version: 1,
        kinds: { machine: { prefix: "machiné" } },
      },
    ],
    [
      "distinct prefixes",
      {
        family: "machine",
        version: 1,
        kinds: {
          machine: { prefix: "machine" },
          lease: { prefix: "machine" },
        },
      },
    ],
  ] as const;

  for (const [law, definition] of invalidDefinitions) {
    let thrown: unknown;
    try {
      defineIdFamily(definition);
    } catch (error) {
      if (!(error instanceof CairnDefinitionError)) throw error;
      thrown = error;
    }

    expect(thrown, law).toBeInstanceOf(CairnDefinitionError);
    if (!(thrown instanceof CairnDefinitionError)) continue;
    expect(thrown.name, law).toBe("CairnDefinitionError");
    expect(thrown.code, law).toBe("invalid_definition");
    expect(thrown.message, law).toBe(
      "Cairn identifier family definition is invalid",
    );
    for (const detail of [
      "family",
      "kind",
      "cause",
      "definition",
      "input",
      "rejected",
      "rejectedDefinition",
    ]) {
      expect(Reflect.has(thrown, detail), `${law}: ${detail}`).toBe(false);
    }
  }
});

it("parses only canonical fixed-length identifiers with deterministic failure precedence", () => {
  const callerIds = defineIdFamily({
    family: "caller",
    version: 1,
    kinds: {
      fixed: { prefix: "fixed" },
      legacy: { prefix: "legacy" },
    },
  });
  const fixedId = "fixed_0123456789abcdefghijk";
  for (const [codec, identifier] of [
    [callerIds.fixed, fixedId],
    [callerIds.legacy, `legacy_${"z".repeat(21)}`],
  ] as const) {
    expect(codec.parse(identifier)).toEqual({
      ok: true,
      value: identifier,
    });
    expect(codec.is(identifier)).toBe(true);
  }

  expect(callerIds.fixed.schema.safeParse(null).success).toBe(false);
  expect(callerIds.fixed.schema.parse(fixedId)).toBe(fixedId);

  const failures = [
    [callerIds.fixed, "ab", "fixed", "bounds"],
    [callerIds.fixed, "é".repeat(49), "fixed", "bounds"],
    [callerIds.fixed, `fixed_${"A".repeat(20)}`, "fixed", "bounds"],
    [callerIds.legacy, `legacy_${"A".repeat(64)}`, "legacy", "bounds"],
    [callerIds.legacy, "legacy_a", "legacy", "bounds"],
    [callerIds.legacy, `legacy_${"a".repeat(22)}`, "legacy", "bounds"],
    [
      callerIds.fixed,
      " fixed_0123456789abcdefghijk ",
      "fixed",
      "non_canonical",
    ],
    [callerIds.fixed, `FIXED_${"A".repeat(21)}`, "fixed", "non_canonical"],
    [callerIds.fixed, "other_0123456789abcdefghijk", "fixed", "grammar"],
    [callerIds.fixed, "fixed-0123456789abcdefghijk", "fixed", "grammar"],
    [callerIds.fixed, `fixed_${"0".repeat(20)}!`, "fixed", "grammar"],
    [callerIds.fixed, `fixed__${"0".repeat(20)}`, "fixed", "grammar"],
    [callerIds.fixed, `fixed_%30${"0".repeat(18)}`, "fixed", "grammar"],
    [
      callerIds.fixed,
      "\u00a0fixed_0123456789abcdefghijk\u00a0",
      "fixed",
      "grammar",
    ],
    [callerIds.fixed, `fixed_${"０".repeat(21)}`, "fixed", "grammar"],
  ] as const;

  for (const [codec, input, kind, reason] of failures) {
    const result = codec.parse(input);
    expect(result).toEqual({
      ok: false,
      error: {
        code: "invalid_id",
        family: "caller",
        kind,
        version: 1,
        reason,
      },
    });
    expect(result).not.toHaveProperty("value");
    expect(result).not.toHaveProperty("error.value");
    expect(result).not.toHaveProperty("error.input");
  }

  expect(callerIds.fixed.is(`fixed_${"0".repeat(20)}!`)).toBe(false);
  expect(callerIds.legacy.is("legacy_")).toBe(false);
});

it("uses fixed secure generation and translates entropy failure without leakage", async () => {
  const runtimeIdModule = await import("./identifier.js");
  expect(Object.keys(runtimeIdModule).sort()).toEqual([
    "CairnDefinitionError",
    "CairnGenerationError",
    "defineIdFamily",
    "identifierCandidateSchema",
    "identifierDefinitionSchema",
  ]);

  const failureIds = defineIdFamily({
    family: "failure",
    version: 1,
    kinds: {
      failure: { prefix: "failure_compatibility" },
    },
  });
  const generated = failureIds.failure.generate();
  expect(generated).toMatch(/^failure_compatibility_[a-z0-9]{21}$/);
  expect(failureIds.failure.parse(generated)).toEqual({
    ok: true,
    value: generated,
  });

  const foreignSecret = "FOREIGN_ENTROPY_SECRET_DO_NOT_LEAK";
  const foreignError = Object.assign(
    new Error(`Node WebCrypto exposed ${foreignSecret}`),
    {
      code: "FOREIGN_ENTROPY_FAILURE",
      detail: { secret: foreignSecret },
      randomBytes: new Uint8Array([13, 37, 99]),
      rejected: foreignSecret,
    },
  );
  let thrown: unknown;

  Object.defineProperty(webcrypto, "getRandomValues", {
    configurable: true,
    value: () => {
      throw foreignError;
    },
  });
  try {
    for (let attempt = 0; attempt < 512; attempt += 1) {
      try {
        failureIds.failure.generate();
      } catch (error) {
        if (!(error instanceof CairnGenerationError)) throw error;
        thrown = error;
        break;
      }
    }
  } finally {
    Reflect.deleteProperty(webcrypto, "getRandomValues");
  }

  expect(thrown).toBeInstanceOf(CairnGenerationError);
  if (!(thrown instanceof CairnGenerationError)) return;
  expect(thrown.name).toBe("CairnGenerationError");
  expect(thrown.code).toBe("entropy_unavailable");
  expect(thrown.message).toBe("Cairn entropy source is unavailable");
  expect(thrown.family).toBe("failure");
  expect(thrown.kind).toBe("failure");
  expect(thrown.version).toBe(1);
  expect(thrown).not.toBe(foreignError);
  expect(thrown.message).not.toContain(foreignSecret);
  expect(JSON.stringify(thrown)).not.toContain(foreignSecret);
  for (const detail of [
    "cause",
    "foreignError",
    "error",
    "detail",
    "secret",
    "bytes",
    "randomBytes",
    "input",
    "rejected",
    "rejectedBytes",
  ]) {
    expect(Reflect.has(thrown, detail), detail).toBe(false);
  }
});
