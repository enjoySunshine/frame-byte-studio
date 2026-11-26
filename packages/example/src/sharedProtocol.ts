export * from "./frameCodec.ts";
export { FramePlayerSchema, FrameStateSchema } from "./frameSchema.ts";

import { FramePlayerSchema, FrameStateSchema } from "./frameSchema.ts";

/** Common short names for room/canvas shared schema definitions. */
export const Player = FramePlayerSchema;
export const State = FrameStateSchema;
export const FramePlayerModel = FramePlayerSchema;
export const FrameStateModel = FrameStateSchema;

export type Player = InstanceType<typeof FramePlayerSchema>;
export type State = InstanceType<typeof FrameStateSchema>;
