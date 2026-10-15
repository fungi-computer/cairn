import { customAlphabet } from "nanoid";

/** URL-safe lowercase alphabet used for opaque identifiers. */
export const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Identifier size for compact, non-security-sensitive labels. */
export const SHORT = 8;

/** Default identifier size. */
export const DEFAULT = 21;

/** Identifier size for callers that require additional collision resistance. */
export const LONG = 32;

/**
 * Generate a raw opaque identifier through the runtime-selected nanoid
 * implementation.
 *
 * @remarks
 * This legacy helper accepts trusted sizing-policy inputs; CPU and output scale
 * with the requested size. Finite sizing values delegate exactly to the
 * runtime-selected upstream implementation and may be runtime-specific.
 * Callers should supply a bounded nonnegative integer unless they consciously
 * accept upstream/runtime-specific behavior. Only positive and negative
 * infinity receive Cairn's fixed bounded `RangeError`. For new durable
 * identifiers, use `defineIdFamily`.
 *
 * @param length - Requested output size; supply a bounded nonnegative integer
 * unless accepting upstream/runtime-specific behavior.
 * @returns A lowercase alphanumeric identifier.
 * @throws If `length` is positive or negative infinity. Other finite-size
 * exceptions follow the upstream runtime behavior.
 */
export function nanoid(length: number = DEFAULT): string {
  if (
    length === Number.POSITIVE_INFINITY ||
    length === Number.NEGATIVE_INFINITY
  )
    throw new RangeError("nanoid length must be finite");
  return customAlphabet(ALPHABET, length)();
}
