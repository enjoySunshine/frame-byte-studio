import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LEGACY_FRAME_HEX } from "../src/frameCodec.ts";
import {
  applyFrameToCanvasPlayers,
  drawCanvasPlayers,
} from "../src/canvasPlayers.ts";

describe("canvas frame rendering", () => {
  it("updates an existing player and draws the arc at 340,220", () => {
    const players = new Map([
      ["p", { x: 120, y: 80, score: 7 }],
    ]);

    const frame = applyFrameToCanvasPlayers(players, LEGACY_FRAME_HEX);
    assert.deepEqual(frame, { x: 340, y: 220, score: 7 });
    assert.deepEqual(players.get("p"), { x: 340, y: 220, score: 7 });

    const arcs: number[][] = [];
    const context = {
      clearRect() {},
      beginPath() {},
      arc(...args: number[]) { arcs.push(args); },
      fill() {},
      fillText() {},
      set fillStyle(_value: string) {},
      set font(_value: string) {},
      set textAlign(_value: string) {},
    } as unknown as CanvasRenderingContext2D;

    const count = drawCanvasPlayers(
      context,
      { width: 800, height: 600 },
      players,
      "p",
    );

    assert.equal(count, 1);
    assert.equal(arcs[0]?.[0], 340);
    assert.equal(arcs[0]?.[1], 220);
  });
});
