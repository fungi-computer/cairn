import type {
  CairnId,
  IdCodec,
  IdParseError,
  IdParseResult,
} from "../identifier.js";
import { DEFAULT, nanoid } from "../nanoid.js";
import * as z from "zod";
import { identifierCandidateSchema } from "../input-schema.js";

const SUFFIX_PATTERN = /^[a-z0-9]+$/;
const UTF8_ENCODER = new TextEncoder();

function isAsciiEdgeWhitespace(characterCode: number): boolean {
  return (
    characterCode === 0x20 || (characterCode >= 0x09 && characterCode <= 0x0d)
  );
}

function canonicalizeAscii(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isAsciiEdgeWhitespace(value.charCodeAt(start)))
    start += 1;
  while (end > start && isAsciiEdgeWhitespace(value.charCodeAt(end - 1)))
    end -= 1;

  return value
    .slice(start, end)
    .replace(/[A-Z]/g, (character) =>
      String.fromCharCode(character.charCodeAt(0) + 32),
    );
}

export function createIdentifierCodec<F extends string, K extends string>(
  input: Readonly<{
    family: F;
    kind: K;
    prefix: string;
    entropyUnavailable: () => Error;
  }>,
): IdCodec<F, K> {
  const wirePrefix = `${input.prefix}_`;

  function isCanonical(value: string): boolean {
    if (!value.startsWith(wirePrefix)) return false;

    const suffix = value.slice(wirePrefix.length);
    return suffix.length === DEFAULT && SUFFIX_PATTERN.test(suffix);
  }

  const canonicalSchema = z.lazy(() =>
    z.custom<CairnId<F, K>>((candidate): candidate is CairnId<F, K> => {
      const decoded = identifierCandidateSchema.safeParse(candidate);
      return decoded.success && isCanonical(decoded.data);
    }),
  );

  function parse(
    value: z.output<typeof identifierCandidateSchema>,
  ): IdParseResult<CairnId<F, K>, F, K> {
    let reason: IdParseError<F, K>["reason"];
    const decoded = value;
    const byteLength = UTF8_ENCODER.encode(decoded).byteLength;
    const canonical = canonicalSchema.safeParse(decoded);
    const suffix = decoded.startsWith(wirePrefix)
      ? decoded.slice(wirePrefix.length)
      : undefined;
    if (byteLength < 3 || byteLength > 96) {
      reason = "bounds";
    } else if (suffix !== undefined && Array.from(suffix).length !== DEFAULT) {
      reason = "bounds";
    } else if (canonical.success) {
      return {
        ok: true,
        value: canonical.data,
      };
    } else if (isCanonical(canonicalizeAscii(decoded))) {
      reason = "non_canonical";
    } else {
      reason = "grammar";
    }

    return {
      ok: false,
      error: {
        code: "invalid_id",
        family: input.family,
        kind: input.kind,
        version: 1,
        reason,
      },
    };
  }

  const schema = z.lazy(() =>
    identifierCandidateSchema.transform((value, context) => {
      const result = parse(value);
      if (result.ok) return result.value;
      context.addIssue({ code: "custom", message: result.error.reason });
      return z.NEVER;
    }),
  );

  function generate(): CairnId<F, K> {
    let suffix: string;
    try {
      suffix = nanoid(DEFAULT);
    } catch {
      throw input.entropyUnavailable();
    }

    return canonicalSchema.parse(`${wirePrefix}${suffix}`);
  }

  return {
    family: input.family,
    kind: input.kind,
    version: 1,
    generate,
    schema,
    parse,
    is: (value): value is CairnId<F, K> => parse(value).ok,
  };
}
