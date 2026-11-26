import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Decoder, Encoder } from "@colyseus/schema";

import {
  INITIAL_FRAME_HEX,
  LEGACY_FRAME_HEX,
  bytesToHex,
  encodeFrame,
  hexToBytes,
} from "../src/frameCodec.ts";
import { FramePlayerSchema, FrameStateSchema } from "../src/frameSchema.ts";

describe("Colyseus Schema wire compatibility", () => {
  it("emits the exact captured 20 bytes from the shared schema shape", () => {
    const state = new FrameStateSchema();
    const player = new FramePlayerSchema();
    player.x = 340;
    player.y = 220;
    player.score = 7;
    state.players.set("p", player);

    assert.equal(bytesToHex(new Encoder(state).encodeAll()), LEGACY_FRAME_HEX);
  });

  it("decodes the old join snapshot followed by the old movement packet", () => {
    const state = new FrameStateSchema();
    const decoder = new Decoder(state);

    decoder.decode(hexToBytes(INITIAL_FRAME_HEX));
    let player = state.players.get("p")!;
    assert.deepEqual(
      { x: player.x, y: player.y, score: player.score },
      { x: 120, y: 80, score: 7 },
    );

    decoder.decode(hexToBytes(LEGACY_FRAME_HEX));
    player = state.players.get("p")!;
    assert.deepEqual(
      { x: player.x, y: player.y, score: player.score },
      { x: 340, y: 220, score: 7 },
    );
  });

  it("lets the stock decoder read a newly encoded frame", () => {
    const state = new FrameStateSchema();
    const decoder = new Decoder(state);
    decoder.decode(hexToBytes(INITIAL_FRAME_HEX));
    decoder.decode(encodeFrame({ x: 340, y: 220, score: 7 }));

    const player = state.players.get("p")!;
    assert.equal(player.x, 340);
    assert.equal(player.y, 220);
    assert.equal(player.score, 7);
  });
});
