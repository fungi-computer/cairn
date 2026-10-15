import { v4, v7 } from "uuid";
import * as z from "zod";

declare const ephemeralKeyBrand: unique symbol;

/** Opaque key for one command, retained unchanged across ambiguous retries. */
export type ReplayKey = string & {
  /** Distinguishes a replay command from other string identifiers. */
  readonly [ephemeralKeyBrand]: "replay";
};

/** UUIDv4 correlation key for a transport or external provider protocol. */
export type CorrelationKey = string & {
  /** Distinguishes a transport correlation from a replay command. */
  readonly [ephemeralKeyBrand]: "correlation";
};

const replayWire = z.uuid({ version: "v7" });
const deterministicWire = z.string().regex(/^replay_[a-f0-9]{64}$/);
const deterministic = z.custom<ReplayKey>(
  (value) => deterministicWire.safeParse(value).success,
);
const correlationWire = z.uuid({ version: "v4" });
const replay = z.custom<ReplayKey>(
  (value) => replayWire.safeParse(value).success,
);
const correlation = z.custom<CorrelationKey>(
  (value) => correlationWire.safeParse(value).success,
);

/** Mint once per command; the caller owns retention and completion. */
export function replayKey(): ReplayKey {
  return replay.parse(v7());
}

/**
 * Derive one replay identity from a host-owned domain and ordered tuple.
 * Callers include the complete authority scope and stored command identity.
 * JSON string encoding preserves lone surrogates; byte-length frames prevent
 * boundary shifts. This encoding and its version remain stable across restarts.
 */
export async function deterministicReplayKey(
  domain: string,
  parts: readonly string[],
): Promise<ReplayKey> {
  const encoder = new TextEncoder();
  const frames = ["cairn:replay:v1\0", `${String(parts.length)}:`];
  for (const part of [domain, ...parts]) {
    const canonical = JSON.stringify(part);
    frames.push(`${String(encoder.encode(canonical).byteLength)}:`, canonical);
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    encoder.encode(frames.join("")),
  );
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return deterministic.parse(`replay_${hex}`);
}

/** Generate a correlation UUID without creating a durable domain identity. */
export function correlationKey(): CorrelationKey {
  return correlation.parse(v4());
}

/**
 * Own a connection-local sequence for protocols such as CDP that require
 * numeric correlation IDs. A new connection owns a new sequence.
 */
export function createCorrelationSequence(): () => number {
  let next = 0;
  return () => {
    if (next === Number.MAX_SAFE_INTEGER)
      throw new RangeError("Correlation sequence exhausted");
    next += 1;
    return next;
  };
}
