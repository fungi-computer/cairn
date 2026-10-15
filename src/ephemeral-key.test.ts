import { describe, expect, it } from "vitest";
import * as z from "zod";
import {
  correlationKey,
  createCorrelationSequence,
  replayKey,
  deterministicReplayKey,
} from "./ephemeral-key.js";

describe("ephemeral keys", () => {
  it("preserves UUIDv7 replay timestamps and UUIDv4 provider correlation", () => {
    const before = Date.now();
    const keys = Array.from({ length: 100 }, () => replayKey());
    expect(new Set(keys).size).toBe(100);
    for (const key of keys) {
      expect(z.uuid({ version: "v7" }).safeParse(key).success).toBe(true);
      const time = Number.parseInt(key.slice(0, 13).replaceAll("-", ""), 16);
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(Date.now());
    }
    expect(z.uuid({ version: "v4" }).safeParse(correlationKey()).success).toBe(
      true,
    );
  });

  it("isolates numeric correlations by connection", () => {
    const first = createCorrelationSequence();
    const second = createCorrelationSequence();
    expect([first(), first(), second(), first(), second()]).toEqual([
      1, 2, 1, 3, 2,
    ]);
  });
});

it("derives scope-separated replay keys with unambiguous tuple boundaries", async () => {
  const parts = ["team-a", "agent-a", "session-a", "command-a", "tool-a", "0"];
  expect(await deterministicReplayKey("agent-delegation", parts)).toBe(
    await deterministicReplayKey("agent-delegation", [...parts]),
  );
  expect(
    await deterministicReplayKey("agent-delegation", ["ab", "c"]),
  ).not.toBe(await deterministicReplayKey("agent-delegation", ["a", "bc"]));
  expect(
    await deterministicReplayKey("agent-delegation", ["💚", "x"]),
  ).not.toBe(await deterministicReplayKey("agent-delegation", ["💚x", ""]));
  expect(await deterministicReplayKey("other", parts)).not.toBe(
    await deterministicReplayKey("agent-delegation", parts),
  );
  for (const index of [0, 1, 2]) {
    const changed = [...parts];
    changed[index] = "another-scope";
    expect(await deterministicReplayKey("agent-delegation", changed)).not.toBe(
      await deterministicReplayKey("agent-delegation", parts),
    );
  }
});

it("matches the SHA-256 vector for the versioned length-prefixed encoding", async () => {
  // UTF-8 preimage: cairn:replay:v1\0 + 2:3:"d"3:"a"4:"bc"
  expect(await deterministicReplayKey("d", ["a", "bc"])).toBe(
    "replay_9538848f1f35d6a6782fd19dedd53d437d8a18822e6976b3f0a28dc844610f80",
  );
});
