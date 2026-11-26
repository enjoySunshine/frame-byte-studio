import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  INITIAL_FRAME_HEX,
  LEGACY_FRAME_HEX,
  bytesToHex,
  decodeCoordinates,
  decodeFrame,
  encodeFrame,
  hexToBytes,
  isLegacyFrame,
} from "../src/frameCodec.ts";

describe("captured frame compatibility fixture", () => {
  it("keeps the historical 20-byte movement packet stable", () => {
    const bytes = hexToBytes(LEGACY_FRAME_HEX);
    assert.equal(bytes.length, 20);
    assert.equal(bytesToHex(bytes), LEGACY_FRAME_HEX);
    assert.ok(isLegacyFrame(bytes));
  });

  it("decodes the old packet to 340, 220 and score 7 on an existing player", () => {
    const players = new Map([
      ["p", { x: 120, y: 80, score: 7 }],
    ]);

    const player = decodeFrame(LEGACY_FRAME_HEX, { players });

    assert.deepEqual(player, { x: 340, y: 220, score: 7 });
    assert.deepEqual(players.get("p"), { x: 340, y: 220, score: 7 });
    assert.deepEqual(decodeCoordinates(LEGACY_FRAME_HEX), { x: 340, y: 220 });
  });

  it("decodes the join snapshot first, then the movement packet", () => {
    const state = { players: new Map() };

    const joined = decodeFrame(INITIAL_FRAME_HEX, state);
    assert.deepEqual(joined, { x: 120, y: 80, score: 7 });

    const moved = decodeFrame(LEGACY_FRAME_HEX, state);
    assert.deepEqual(moved, { x: 340, y: 220, score: 7 });
  });

  it("encodes the same coordinate/score triple as readable bytes", () => {
    const encoded = encodeFrame({ x: 340, y: 220, score: 7 });

    assert.equal(encoded.length, 20);
    assert.equal(bytesToHex(encoded), LEGACY_FRAME_HEX);
    assert.deepEqual(decodeFrame(encoded), { x: 340, y: 220, score: 7 });
  });

  it("round-trips a newly written frame against the legacy reader", () => {
    const nextBytes = encodeFrame({ x: 340, y: 220, score: 7 });
    const existing = {
      players: { p: { x: 120, y: 80, score: 7 } },
    };

    assert.deepEqual(decodeFrame(nextBytes, existing), {
      x: 340,
      y: 220,
      score: 7,
    });
    assert.deepEqual(existing.players.p, { x: 340, y: 220, score: 7 });
  });

  it("keeps an existing score when a shorter x/y-only delta omits it", () => {
    const existing = {
      players: new Map([["p", { x: 120, y: 80, score: 7 }]]),
    };

    assert.deepEqual(decodeFrame("ff0280cd540181ccdc", existing), {
      x: 340,
      y: 220,
      score: 7,
    });
  });
});
