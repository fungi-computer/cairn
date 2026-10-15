const FIXED_IDENTIFIER = "machine_0123456789abcdefghijk";
const MAXIMUM_STRUCTURE_DEPTH = 8;
const MAXIMUM_STRUCTURE_NODES = 128;
const MAXIMUM_STRUCTURE_KEYS = 32;

function fail(message) {
  throw new Error(`Cairn public identifier runtime law failed: ${message}`);
}

function expectEqual(actual, expected, law) {
  if (actual !== expected) {
    fail(
      `${law}; expected ${describeValue(expected)}, received ${describeValue(actual)}`,
    );
  }
}

function describeValue(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(length=${String(value.length)})`;
  if (Object(value) === value) {
    return `object(keys=${String(Object.keys(value).length)})`;
  }
  const representation = String(value);
  return representation.length > 128
    ? `${representation.slice(0, 128)}...`
    : representation;
}

function expectStructure(actual, expected, law) {
  const pending = [{ actual, depth: 0, expected, path: "$" }];
  let examinedNodes = 0;

  while (pending.length > 0) {
    const comparison = pending.pop();
    if (comparison === undefined) break;
    examinedNodes += 1;
    if (examinedNodes > MAXIMUM_STRUCTURE_NODES) {
      fail(
        `${law}; structure exceeds ${String(MAXIMUM_STRUCTURE_NODES)} nodes`,
      );
    }

    if (Object.is(comparison.actual, comparison.expected)) continue;
    if (comparison.depth >= MAXIMUM_STRUCTURE_DEPTH) {
      fail(
        `${law}; ${comparison.path} exceeds depth ${String(MAXIMUM_STRUCTURE_DEPTH)}`,
      );
    }

    const expectedIsArray = Array.isArray(comparison.expected);
    if (expectedIsArray || Array.isArray(comparison.actual)) {
      if (!expectedIsArray || !Array.isArray(comparison.actual)) {
        fail(
          `${law}; ${comparison.path} expected ${describeValue(comparison.expected)}, received ${describeValue(comparison.actual)}`,
        );
      }
      if (comparison.actual.length !== comparison.expected.length) {
        fail(
          `${law}; ${comparison.path} expected array length ${String(comparison.expected.length)}, received ${String(comparison.actual.length)}`,
        );
      }
      if (comparison.expected.length > MAXIMUM_STRUCTURE_KEYS) {
        fail(
          `${law}; ${comparison.path} exceeds ${String(MAXIMUM_STRUCTURE_KEYS)} array entries`,
        );
      }
      for (let index = comparison.expected.length - 1; index >= 0; index -= 1) {
        pending.push({
          actual: comparison.actual[index],
          depth: comparison.depth + 1,
          expected: comparison.expected[index],
          path: `${comparison.path}[${String(index)}]`,
        });
      }
      continue;
    }

    const expectedIsObject =
      comparison.expected !== null &&
      Object(comparison.expected) === comparison.expected;
    const actualIsObject =
      comparison.actual !== null &&
      Object(comparison.actual) === comparison.actual;
    if (!expectedIsObject || !actualIsObject) {
      fail(
        `${law}; ${comparison.path} expected ${describeValue(comparison.expected)}, received ${describeValue(comparison.actual)}`,
      );
    }

    const expectedKeys = Object.keys(comparison.expected).sort();
    const actualKeys = Object.keys(comparison.actual).sort();
    if (
      expectedKeys.length > MAXIMUM_STRUCTURE_KEYS ||
      actualKeys.length > MAXIMUM_STRUCTURE_KEYS
    ) {
      fail(
        `${law}; ${comparison.path} exceeds ${String(MAXIMUM_STRUCTURE_KEYS)} object keys`,
      );
    }
    if (actualKeys.length !== expectedKeys.length) {
      fail(
        `${law}; ${comparison.path} expected keys ${expectedKeys.join(",")}, received ${actualKeys.join(",")}`,
      );
    }
    for (let index = 0; index < expectedKeys.length; index += 1) {
      if (actualKeys[index] !== expectedKeys[index]) {
        fail(
          `${law}; ${comparison.path} expected keys ${expectedKeys.join(",")}, received ${actualKeys.join(",")}`,
        );
      }
    }
    for (let index = expectedKeys.length - 1; index >= 0; index -= 1) {
      const key = expectedKeys[index];
      if (key === undefined) continue;
      pending.push({
        actual: comparison.actual[key],
        depth: comparison.depth + 1,
        expected: comparison.expected[key],
        path: `${comparison.path}.${key}`,
      });
    }
  }
}

/**
 * Exercises only the stable `@fungi.computer/cairn/id` runtime contract.
 *
 * @param {typeof import("@fungi.computer/cairn/id")} identifierModule
 */
export function assertIdentifierRuntime(identifierModule) {
  expectStructure(
    Object.keys(identifierModule).sort(),
    [
      "CairnDefinitionError",
      "CairnGenerationError",
      "defineIdFamily",
      "identifierCandidateSchema",
      "identifierDefinitionSchema",
    ],
    "the subpath has an exact value-export inventory",
  );

  const machineIds = identifierModule.defineIdFamily({
    family: "machine",
    version: 1,
    kinds: {
      machine: { prefix: "machine" },
      lease: { prefix: "machine_lease" },
      legacy: { prefix: "legacy_machine" },
    },
  });

  expectStructure(
    {
      family: machineIds.machine.family,
      kind: machineIds.machine.kind,
      version: machineIds.machine.version,
    },
    { family: "machine", kind: "machine", version: 1 },
    "a family definition produces exact codec metadata",
  );
  expectStructure(
    machineIds.machine.parse(FIXED_IDENTIFIER),
    { ok: true, value: FIXED_IDENTIFIER },
    "a canonical identifier parses without replacement",
  );
  expectStructure(
    machineIds.lease.parse(FIXED_IDENTIFIER),
    {
      ok: false,
      error: {
        code: "invalid_id",
        family: "machine",
        kind: "lease",
        version: 1,
        reason: "grammar",
      },
    },
    "another kind rejects the same bytes as grammar",
  );
  expectEqual(
    machineIds.machine.schema.safeParse(null).success,
    false,
    "a non-string is rejected at the exported schema boundary",
  );
  expectEqual(
    machineIds.machine.schema.parse(FIXED_IDENTIFIER),
    FIXED_IDENTIFIER,
    "the schema yields the original canonical branded identifier",
  );
  expectStructure(
    machineIds.machine.parse("machine_a"),
    {
      ok: false,
      error: {
        code: "invalid_id",
        family: "machine",
        kind: "machine",
        version: 1,
        reason: "bounds",
      },
    },
    "an exact-prefix short suffix receives the bounds failure",
  );
  expectStructure(
    machineIds.machine.parse(` ${FIXED_IDENTIFIER.toUpperCase()} `),
    {
      ok: false,
      error: {
        code: "invalid_id",
        family: "machine",
        kind: "machine",
        version: 1,
        reason: "non_canonical",
      },
    },
    "ASCII case and edge whitespace receive the non-canonical failure",
  );
  expectStructure(
    machineIds.machine.parse("wrong_0123456789abcdefghijk"),
    {
      ok: false,
      error: {
        code: "invalid_id",
        family: "machine",
        kind: "machine",
        version: 1,
        reason: "grammar",
      },
    },
    "a wrong prefix receives the grammar failure",
  );
  expectStructure(
    machineIds.legacy.parse("legacy_machine_a"),
    {
      ok: false,
      error: {
        code: "invalid_id",
        family: "machine",
        kind: "legacy",
        version: 1,
        reason: "bounds",
      },
    },
    "every declared kind enforces the canonical suffix length",
  );

  const canonicalLegacy = `legacy_machine_${"a".repeat(21)}`;
  expectStructure(
    machineIds.legacy.parse(canonicalLegacy),
    { ok: true, value: canonicalLegacy },
    "the declared legacy-named kind accepts canonical bytes without a compatibility grammar",
  );

  const generated = machineIds.machine.generate();
  if (!/^machine_[a-z0-9]{21}$/.test(generated)) {
    fail(
      `generation returned non-canonical bytes: ${JSON.stringify(generated)}`,
    );
  }
  expectStructure(
    machineIds.machine.parse(generated),
    { ok: true, value: generated },
    "a generated identifier parses through the same codec",
  );

  let invalidDefinition;
  try {
    identifierModule.defineIdFamily({
      family: "Machine",
      version: 1,
      kinds: { machine: { prefix: "machine" } },
    });
  } catch (error) {
    invalidDefinition = error;
  }
  if (!(invalidDefinition instanceof identifierModule.CairnDefinitionError)) {
    fail("an invalid definition did not throw CairnDefinitionError");
  }
  expectEqual(
    invalidDefinition.name,
    "CairnDefinitionError",
    "definition error name",
  );
  expectEqual(
    invalidDefinition.code,
    "invalid_definition",
    "definition error code",
  );
  expectEqual(
    invalidDefinition.message,
    "Cairn identifier family definition is invalid",
    "definition error message",
  );
  for (const forbidden of ["cause", "family", "kind", "input", "definition"]) {
    if (Reflect.has(invalidDefinition, forbidden)) {
      fail(`definition error retained forbidden field ${forbidden}`);
    }
  }

  const generationError = new identifierModule.CairnGenerationError({
    family: "machine",
    kind: "machine",
  });
  expectStructure(
    {
      name: generationError.name,
      code: generationError.code,
      message: generationError.message,
      family: generationError.family,
      kind: generationError.kind,
      version: generationError.version,
      hasCause: Reflect.has(generationError, "cause"),
    },
    {
      name: "CairnGenerationError",
      code: "entropy_unavailable",
      message: "Cairn entropy source is unavailable",
      family: "machine",
      kind: "machine",
      version: 1,
      hasCause: false,
    },
    "generation errors expose only the bounded public fields",
  );

  return Object.freeze({ generated, parsed: FIXED_IDENTIFIER });
}
