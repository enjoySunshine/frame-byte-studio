import {
  MAP_HEIGHT,
  MAP_WIDTH,
  decodeFrame,
  type ByteInput,
  type PlayerCoordinates,
  type PlayerFrame,
} from "./frameCodec.ts";

export type CanvasPlayer = {
  x: number;
  y: number;
  score?: number;
};

export type CanvasPlayerMap = Map<string, CanvasPlayer>;

/** The logical 800×600 map is also the canvas's backing-pixel coordinate system. */
export function mapPointToCanvas(
  point: PlayerCoordinates,
  mapSize: { width: number; height: number } = { width: MAP_WIDTH, height: MAP_HEIGHT },
  canvasSize: { width: number; height: number } = { width: MAP_WIDTH, height: MAP_HEIGHT },
): PlayerCoordinates {
  return {
    x: point.x * canvasSize.width / mapSize.width,
    y: point.y * canvasSize.height / mapSize.height,
  };
}

export const toCanvasCoordinates = mapPointToCanvas;

export function isVisibleOnMap(
  point: PlayerCoordinates,
  width = MAP_WIDTH,
  height = MAP_HEIGHT,
): boolean {
  return point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height;
}

/**
 * Apply a binary frame to the canvas's existing player map and return the
 * decoded triple. The existing entry is important for real delta frames whose
 * unchanged score field may be omitted by the encoder.
 */
export function applyFrameToCanvasPlayers(
  players: CanvasPlayerMap,
  bytes: ByteInput,
  playerId = "p",
): PlayerFrame {
  return decodeFrame(bytes, { players }, playerId);
}

/**
 * Draw all canvas players. Coordinates are passed directly to `arc`, so the
 * painted center is exactly the decoded x/y pair (for the fixture: 340,220).
 */
export function drawCanvasPlayers(
  context: CanvasRenderingContext2D,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  players: CanvasPlayerMap,
  currentSessionId?: string | null,
): number {
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (const [sessionId, player] of players) {
    const isMe = sessionId === currentSessionId;
    const position = mapPointToCanvas(player, undefined, canvas);

    context.beginPath();
    context.arc(position.x, position.y, 12, 0, Math.PI * 2);
    context.fillStyle = isMe ? "#2563eb" : "#6b7280";
    context.fill();

    context.fillStyle = "#9ca3af";
    context.font = "10px monospace";
    context.textAlign = "center";
    context.fillText(sessionId.slice(0, 6), position.x, position.y + 24);

    if (typeof player.score === "number") {
      context.fillStyle = "#e5e7eb";
      context.fillText(`score ${player.score}`, position.x, position.y - 18);
    }
  }

  return players.size;
}

/** Decode a frame onto the map, then immediately repaint the canvas. */
export function paintFrame(
  context: CanvasRenderingContext2D,
  canvas: Pick<HTMLCanvasElement, "width" | "height">,
  players: CanvasPlayerMap,
  bytes: ByteInput,
  currentSessionId?: string | null,
  playerId?: string,
): PlayerFrame {
  const frame = applyFrameToCanvasPlayers(players, bytes, playerId);
  drawCanvasPlayers(context, canvas, players, currentSessionId);
  return frame;
}
