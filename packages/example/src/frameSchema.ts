import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Wire schema whose field indices match the captured fixture exactly:
 * Player.x = 0, Player.y = 1, Player.score = 2.
 */
export const FramePlayerSchema = schema({
  x: t.number(),
  y: t.number(),
  score: t.number(),
});
export type FramePlayerSchema = SchemaType<typeof FramePlayerSchema>;

export const FrameStateSchema = schema({
  players: t.map(FramePlayerSchema),
});
export type FrameStateSchema = SchemaType<typeof FrameStateSchema>;

// Short aliases for room-side code.
export const FrameState = FrameStateSchema;
export const FrameRoomState = FrameStateSchema;
export type FramePlayer = FramePlayerSchema;
export type FrameState = FrameStateSchema;
export type FrameRoomState = FrameStateSchema;
