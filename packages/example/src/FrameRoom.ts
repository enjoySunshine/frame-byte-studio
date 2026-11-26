import { Room, type Client } from "@colyseus/core";
import {
  FIXTURE_PLAYER_ID,
  MAP_HEIGHT,
  MAP_WIDTH,
  encodeFrame,
  type PlayerFrame,
} from "./frameCodec.ts";
import {
  FramePlayerSchema,
  FrameStateSchema,
} from "./frameSchema.ts";

export const FramePlayer = FramePlayerSchema;
export const FrameRoomState = FrameStateSchema;
export type FramePlayer = InstanceType<typeof FramePlayerSchema>;
export type FrameRoomState = InstanceType<typeof FrameStateSchema>;

export class FrameRoom extends Room<{ state: FrameRoomState }> {
  state = new FrameStateSchema() as FrameRoomState;

  readonly mapWidth = MAP_WIDTH;
  readonly mapHeight = MAP_HEIGHT;

  onCreate(): void {
    this.onMessage("move", (client, message: { x?: number; y?: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (Number.isFinite(message?.x)) player.x = message.x!;
      if (Number.isFinite(message?.y)) player.y = message.y!;
      this.broadcastFrame(client.sessionId);
    });

    this.onMessage("fixture_move", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.x = 340;
      player.y = 220;
      player.score = 7;
      this.broadcastFrame(client.sessionId);
    });
  }

  private broadcastFrame(playerId: string): void {
    // Also expose the exact shared byte representation for canvas-side binary
    // decoder tests. The Schema state patch remains the normal sync channel.
    this.broadcast("frame_bytes", this.packPlayerFrame(playerId));
  }

  onJoin(client: Client): void {
    const player = new FramePlayerSchema();
    player.x = 120;
    player.y = 80;
    player.score = 7;
    this.state.players.set(client.sessionId, player);
  }

  /** Shared room-side writer for the captured stable-id fixture. */
  packCapturedFrame(): Uint8Array {
    return encodeFrame({ x: 340, y: 220, score: 7 }, undefined, undefined, FIXTURE_PLAYER_ID);
  }

  /** Encode one current room player using the shared byte layout. */
  packPlayerFrame(playerId: string): Uint8Array {
    const player = this.state.players.get(playerId);
    const frame: PlayerFrame = {
      x: player?.x ?? 0,
      y: player?.y ?? 0,
      score: player?.score ?? 0,
    };
    return encodeFrame(frame, undefined, undefined, playerId);
  }
}

// Name aliases for task/room naming conventions.
export const FrameByteStudioRoom = FrameRoom;
export const FramePacketRoom = FrameRoom;
export const BinaryFrameRoom = FrameRoom;
