import * as z from "zod";

const FAMILY_OR_KIND_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PREFIX_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z][a-z0-9]*)*$/;

const familySchema = z.string().min(1).max(64).regex(FAMILY_OR_KIND_PATTERN);
const kindSchema = z.string().min(1).max(64).regex(FAMILY_OR_KIND_PATTERN);
const prefixSchema = z.string().min(1).max(32).regex(PREFIX_PATTERN);
const kindDefinitionSchema = z.object({
  /** Lowercase wire prefix for this kind. */
  prefix: prefixSchema,
});
/** Validate one bounded version 1 family declaration. */
export const identifierDefinitionSchema = z
  .object({
    /** Caller-owned family name. */
    family: familySchema,
    /** Supported wire grammar version. */
    version: z.literal(1),
    /** Kind declarations with unique wire prefixes. */
    kinds: z.record(kindSchema, kindDefinitionSchema),
  })
  .superRefine((definition, context) => {
    const kinds = Object.entries(definition.kinds);
    if (kinds.length < 1 || kinds.length > 64) {
      context.addIssue({
        code: "custom",
        message: "Identifier families must declare between one and 64 kinds",
      });
      return;
    }

    const prefixes = new Set<string>();
    for (const [, kind] of kinds) {
      if (prefixes.has(kind.prefix)) {
        context.addIssue({
          code: "custom",
          message: "Identifier kind prefixes must be distinct",
        });
        return;
      }
      prefixes.add(kind.prefix);
    }
  });

/** Decode a wire candidate before calling a typed string codec. */
export const identifierCandidateSchema = z.string();
