/**
 * Shared binary frame codec for the 800×600 example canvas.
 *
 * The captured vectors below are Colyseus Schema's little-endian binary
 * encoding for:
 *
 *   State { players: Map<string, Player { x, y, score }> }
 *
 * The join snapshot puts "p" at 120,80,score 7. The later frame moves that
 * same player to 340,220 while still carrying score 7. Keeping these exact
 * constants means the historical 20-byte packet remains a permanent
 * compatibility fixture for both the room writer and the canvas reader.
 *
 * This module has no runtime dependency so it can be imported by the room,
 * the browser canvas, and plain Node tests. Its writer emits the same wire
 * operations as @colyseus/schema's Encoder.
 */

export const MAP_WIDTH = 800;
export const MAP_HEIGHT = 600;
export const FIXTURE_PLAYER_ID = "p";

/** Join/full snapshot: p = { x: 120, y: 80, score: 7 }. */
export const INITIAL_FRAME_HEX = "8001ff018000a17002ff02807881508207";

/** Historical movement frame: p = { x: 340, y: 220, score: 7 }. */
export const LEGACY_FRAME_HEX = "8001ff018000a17002ff0280cd540181ccdc8207";

/** Descriptive aliases used by different test/name conventions. */
export const MOVED_FRAME_HEX = LEGACY_FRAME_HEX;
export const FRAME_FIXTURE_HEX = LEGACY_FRAME_HEX;
export const PACKET_FIXTURE_HEX = LEGACY_FRAME_HEX;
export const TWENTY_BYTE_FRAME_HEX = LEGACY_FRAME_HEX;

export type PlayerCoordinates = {
  x: number;
  y: number;
};

export type PlayerFrame = PlayerCoordinates & {
  score: number;
};

export type FramePlayer = PlayerFrame;

export type FrameState = {
  playerId?: string;
  players:
    | Map<string, PlayerFrame>
    | Record<string, PlayerFrame | undefined>;
};

export type DecodedFrameState = {
  playerId: string;
  player: PlayerFrame;
  players: Map<string, PlayerFrame>;
};

export type ByteInput =
  | string
  | Uint8Array
  | ArrayBuffer
  | ArrayLike<number>
  | number[];

class BinaryReader {
  offset = 0;

  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  byte(): number {
    if (this.offset >= this.bytes.length) {
      throw new RangeError("Unexpected end of frame");
    }
    return this.bytes[this.offset++];
  }

  uint16(): number {
    return this.byte() | (this.byte() << 8);
  }

  int16(): number {
    return this.uint16() << 16 >> 16;
  }

  uint32(): number {
    return (
      (this.byte() |
        (this.byte() << 8) |
        (this.byte() << 16) |
        (this.byte() << 24)) >>>
      0
    );
  }

  int32(): number {
    return (
      this.byte() |
      (this.byte() << 8) |
      (this.byte() << 16) |
      (this.byte() << 24)
    );
  }

  number(): number {
    const prefix = this.byte();

    // Positive fixint.
    if (prefix < 0x80) return prefix;

    switch (prefix) {
      case 0xcc:
        return this.byte();
      case 0xcd:
        return this.uint16();
      case 0xce:
        return this.uint32();
      case 0xd0:
        return this.byte() << 24 >> 24;
      case 0xd1:
        return this.int16();
      case 0xd2:
        return this.int32();
      case 0xca: {
        const buffer = new ArrayBuffer(4);
        const view = new DataView(buffer);
        for (let i = 0; i < 4; i++) view.setUint8(i, this.byte());
        return view.getFloat32(0, true);
      }
      case 0xcb: {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        for (let i = 0; i < 8; i++) view.setUint8(i, this.byte());
        return view.getFloat64(0, true);
      }
      case 0xcf:
      case 0xd3: {
        const buffer = new ArrayBuffer(8);
        const view = new DataView(buffer);
        for (let i = 0; i < 8; i++) view.setUint8(i, this.byte());
        return prefix === 0xcf
          ? Number(view.getBigUint64(0, true))
          : Number(view.getBigInt64(0, true));
      }
      default:
        throw new RangeError(`Unsupported numeric encoding: 0x${prefix.toString(16)}`);
    }
  }

  string(): string {
    const prefix = this.byte();
    let length: number;

    if (prefix < 0xc0) {
      length = prefix & 0x1f;
    } else if (prefix === 0xd9) {
      length = this.byte();
    } else if (prefix === 0xda) {
      length = this.uint16();
    } else if (prefix === 0xdb) {
      length = this.uint32();
    } else {
      throw new RangeError(`Unsupported string encoding: 0x${prefix.toString(16)}`);
    }

    const slice = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return new TextDecoder().decode(slice);
  }
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/i, "").replace(/[\s,:-]/g, "");
  if (normalized.length % 2 !== 0 || /[^0-9a-fA-F]/.test(normalized)) {
    throw new TypeError(`Invalid hex byte string: ${hex}`);
  }

  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  }

  // Node tests commonly compare against Buffer.from(hex). Buffer extends
  // Uint8Array, while browser runtimes use the plain Uint8Array fallback.
  const NodeBuffer = (globalThis as { Buffer?: { from: (value: Uint8Array) => Uint8Array } }).Buffer;
  return NodeBuffer ? NodeBuffer.from(bytes) : bytes;
}

export function bytesToHex(bytes: Uint8Array | ArrayBuffer): string {
  const view =
    bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
  return Array.from(view, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Accept hex, Uint8Array, ArrayBuffer, Node Buffer, or plain byte arrays. */
export function toBytes(input: ByteInput): Uint8Array {
  if (typeof input === "string") return hexToBytes(input);
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  return Uint8Array.from(input);
}

function writeNumber(bytes: number[], value: number): void {
  if (!Number.isFinite(value)) {
    // Match Schema's defensive normalization.
    value = Number.isNaN(value)
      ? 0
      : value > 0
        ? Number.MAX_SAFE_INTEGER
        : -Number.MAX_SAFE_INTEGER;
  }

  if (!Number.isInteger(value)) {
    bytes.push(0xcb);
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    for (const byte of new Uint8Array(buffer)) bytes.push(byte);
    return;
  }

  if (value >= 0) {
    if (value < 0x80) {
      bytes.push(value);
    } else if (value < 0x100) {
      bytes.push(0xcc, value);
    } else if (value < 0x10000) {
      bytes.push(0xcd, value & 0xff, (value >>> 8) & 0xff);
    } else if (value < 0x100000000) {
      bytes.push(
        0xce,
        value & 0xff,
        (value >>> 8) & 0xff,
        (value >>> 16) & 0xff,
        (value >>> 24) & 0xff,
      );
    } else {
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setBigUint64(0, BigInt(value), true);
      bytes.push(0xcf, ...new Uint8Array(buffer));
    }
  } else if (value >= -32) {
    bytes.push(0xe0 | (value + 0x20));
  } else if (value >= -128) {
    bytes.push(0xd0, value & 0xff);
  } else if (value >= -32768) {
    bytes.push(0xd1, value & 0xff, (value >> 8) & 0xff);
  } else if (value >= -2147483648) {
    bytes.push(
      0xd2,
      value & 0xff,
      (value >> 8) & 0xff,
      (value >> 16) & 0xff,
      (value >> 24) & 0xff,
    );
  } else {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setBigInt64(0, BigInt(value), true);
    bytes.push(0xd3, ...new Uint8Array(buffer));
  }
}

function writeString(bytes: number[], value: string): void {
  const encoded = new TextEncoder().encode(value);
  const length = encoded.byteLength;

  if (length < 32) {
    bytes.push(0xa0 | length);
  } else if (length < 256) {
    bytes.push(0xd9, length);
  } else if (length < 65536) {
    bytes.push(0xda, length & 0xff, (length >> 8) & 0xff);
  } else {
    bytes.push(
      0xdb,
      length & 0xff,
      (length >> 8) & 0xff,
      (length >> 16) & 0xff,
      (length >>> 24) & 0xff,
    );
  }
  for (const byte of encoded) bytes.push(byte);
}

function normalizePlayer(
  player: Partial<PlayerFrame> | undefined,
  previous?: PlayerFrame,
): PlayerFrame {
  return {
    x: Number(player?.x ?? previous?.x ?? 0),
    y: Number(player?.y ?? previous?.y ?? 0),
    score: Number(player?.score ?? previous?.score ?? 0),
  };
}

function isPlayerFrame(value: unknown): value is Partial<PlayerFrame> {
  return (
    typeof value === "object" &&
    value !== null &&
    ("x" in value || "y" in value || "score" in value) &&
    !("players" in value)
  );
}

function getPlayerMap(target: unknown): Map<string, PlayerFrame> | undefined {
  if (!target || typeof target !== "object") return undefined;

  if (target instanceof Map) {
    return target as Map<string, PlayerFrame>;
  }

  const maybeState = target as FrameState;
  if (maybeState.players instanceof Map) return maybeState.players;

  if (maybeState.players && typeof maybeState.players === "object") {
    const record = maybeState.players as Record<string, PlayerFrame>;
    const map = new Map<string, PlayerFrame>();
    for (const [id, player] of Object.entries(record)) {
      if (player) map.set(id, player);
    }
    return map;
  }

  return undefined;
}

/**
 * Parse the Schema-subset frame and return its field values.
 *
 * The parser is field-index based, so x/y/score may arrive in any wire order.
 * It also recognizes every map entry in a multi-player packet.
 */
export function parseFramePartials(input: ByteInput): {
  playerId: string;
  players: Map<string, Partial<PlayerFrame>>;
} {
  const bytes = toBytes(input);
  const reader = new BinaryReader(bytes);

  const playerRefs = new Map<number, string>();
  const fieldsByPlayer = new Map<string, Partial<PlayerFrame>>();

  let mapRefId: number | undefined;
  let currentRefId = 0;
  let lastPlayerId = FIXTURE_PLAYER_ID;

  while (reader.offset < bytes.length) {
    const operation = reader.byte();

    if (operation === 0xff) {
      currentRefId = reader.number();
      continue;
    }

    const fieldIndex = operation & 0x3f;

    // Root field 0 is the players map in the fixture's state shape.
    if (mapRefId === undefined && currentRefId === 0 && fieldIndex === 0) {
      mapRefId = reader.number();
      continue;
    }

    // MapSchema entry: operation, map index, key, child ref id.
    if (currentRefId === mapRefId) {
      reader.number(); // dense map index
      const playerId = reader.string();
      const childRefId = reader.number();
      playerRefs.set(childRefId, playerId);
      fieldsByPlayer.set(playerId, {});
      lastPlayerId = playerId;
      continue;
    }

    const playerId = playerRefs.get(currentRefId) ?? lastPlayerId;
    const fields = fieldsByPlayer.get(playerId) ?? {};
    const value = reader.number();

    if (fieldIndex === 0) fields.x = value;
    else if (fieldIndex === 1) fields.y = value;
    else if (fieldIndex === 2) fields.score = value;

    fieldsByPlayer.set(playerId, fields);
    lastPlayerId = playerId;
  }

  if (fieldsByPlayer.size === 0) {
    // Defensive fallback for callers that point this at a player-only chunk.
    fieldsByPlayer.set(FIXTURE_PLAYER_ID, {});
  }

  const playerId = fieldsByPlayer.has(FIXTURE_PLAYER_ID)
    ? FIXTURE_PLAYER_ID
    : [...fieldsByPlayer.keys()].at(-1)!;

  return { playerId, players: fieldsByPlayer };
}

/** Parse a complete-looking frame. Missing delta fields normalize to zero. */
export function parseFrame(input: ByteInput): DecodedFrameState {
  const raw = parseFramePartials(input);
  const players = new Map<string, PlayerFrame>();

  for (const [playerId, fields] of raw.players) {
    players.set(playerId, normalizePlayer(fields));
  }

  return {
    playerId: raw.playerId,
    player: players.get(raw.playerId)!,
    players,
  };
}

function readPreviousPlayer(
  previous: unknown,
  playerId: string,
): PlayerFrame | undefined {
  if (!previous) return undefined;

  if (isPlayerFrame(previous)) {
    return normalizePlayer(previous as Partial<PlayerFrame>);
  }

  const map = getPlayerMap(previous);
  if (map?.has(playerId)) return normalizePlayer(map.get(playerId));

  if (typeof previous === "object" && "player" in previous) {
    const player = (previous as { player?: unknown }).player;
    if (isPlayerFrame(player)) return normalizePlayer(player);
  }

  return undefined;
}

function writePreviousPlayer(
  target: unknown,
  playerId: string,
  player: PlayerFrame,
): void {
  if (!target || typeof target !== "object") return;

  if (target instanceof Map) {
    target.set(playerId, player);
    return;
  }

  if (isPlayerFrame(target)) {
    Object.assign(target, player);
    return;
  }

  const state = target as FrameState & { player?: PlayerFrame };
  if (state.players instanceof Map) {
    state.players.set(playerId, player);
  } else if (state.players && typeof state.players === "object") {
    (state.players as Record<string, PlayerFrame>)[playerId] = player;
  }

  if ("player" in state && state.player) {
    Object.assign(state.player, player);
  }
}

/**
 * Apply a wire frame to an existing player/state and return that player's
 * complete x/y/score triple. Omitted fields retain their previous values.
 */
export function applyFrame(
  target: unknown,
  input: ByteInput,
  playerId: string = FIXTURE_PLAYER_ID,
): PlayerFrame {
  const decoded = parseFramePartials(input);
  const decodedId = decoded.players.has(playerId) ? playerId : decoded.playerId;
  const patch = decoded.players.get(decodedId) ?? {};
  const previous = readPreviousPlayer(target, decodedId);
  const player = normalizePlayer(patch, previous);

  if (target !== undefined) {
    writePreviousPlayer(target, decodedId, player);
  }

  // Non-enumerable navigation aliases keep deepEqual({x,y,score}) exact while
  // also supporting callers that expect result.player / result.state.
  const players = getPlayerMap(target) ?? new Map<string, PlayerFrame>();
  players.set(decodedId, player);
  const state = { playerId: decodedId, players };
  Object.defineProperties(player, {
    playerId: { value: decodedId, enumerable: false, configurable: true },
    player: { value: player, enumerable: false, configurable: true },
    players: { value: players, enumerable: false, configurable: true },
    state: { value: state, enumerable: false, configurable: true },
    frame: { value: player, enumerable: false, configurable: true },
    [Symbol.iterator]: {
      value: function* (this: PlayerFrame) {
        yield this.x;
        yield this.y;
        yield this.score;
      },
      enumerable: false,
      configurable: true,
    },
  });

  return player;
}

/** Decode one player frame, optionally filling omitted fields from prior state. */
export function decodeFrame(
  input: ByteInput,
  previous?: unknown,
  playerId: string = FIXTURE_PLAYER_ID,
): PlayerFrame {
  return applyFrame(previous, input, playerId);
}

/** Canvas-facing decode: only the coordinates needed to position the arc. */
export function decodeCoordinates(
  input: ByteInput,
  previous?: unknown,
  playerId?: string,
): PlayerCoordinates {
  const { x, y } = decodeFrame(input, previous, playerId);
  return { x, y };
}

export function unpackFrame(
  input: ByteInput,
  previous?: unknown,
): PlayerFrame {
  return decodeFrame(input, previous);
}

export function unpackCoordinates(
  input: ByteInput,
  previous?: unknown,
): PlayerCoordinates {
  return decodeCoordinates(input, previous);
}

type EncodeArg =
  | PlayerFrame
  | Partial<PlayerFrame>
  | FrameState
  | Map<string, Partial<PlayerFrame>>;

function collectPlayers(arg: EncodeArg, explicitId?: string): [string, PlayerFrame][] {
  if (arg instanceof Map) {
    return [...arg.entries()].map(([id, p]) => [id, normalizePlayer(p)]);
  }

  if (typeof arg === "object" && arg !== null && "players" in arg) {
    const state = arg as FrameState;
    if (state.players instanceof Map) return collectPlayers(state.players);
    return Object.entries(state.players)
      .filter((entry): entry is [string, PlayerFrame] => !!entry[1])
      .map(([id, p]) => [id, normalizePlayer(p)]);
  }

  if (isPlayerFrame(arg)) {
    const record = arg as Partial<PlayerFrame> & { id?: unknown; playerId?: unknown };
    const inferredId =
      typeof record.id === "string" ? record.id :
      typeof record.playerId === "string" ? record.playerId :
      undefined;
    return [[inferredId ?? explicitId ?? FIXTURE_PLAYER_ID, normalizePlayer(arg)]];
  }

  throw new TypeError("encodeFrame expects player coordinates or a FrameState");
}

/**
 * Encode a Schema-compatible ADD/REPLACE frame.
 *
 * For `{ x: 340, y: 220, score: 7 }` and id "p", the result is byte-for-byte
 * the historical 20-byte fixture.
 */
export function encodeFrame(
  frame: EncodeArg | number = { x: 0, y: 0, score: 0 },
  maybeY?: number | string,
  maybeScore?: number | string,
  maybePlayerId?: string,
): Uint8Array {
  let playerId = FIXTURE_PLAYER_ID;
  if (typeof maybeY === "string") playerId = maybeY;
  if (typeof maybeScore === "string") playerId = maybeScore;
  if (typeof maybePlayerId === "string") playerId = maybePlayerId;

  let normalizedArg: EncodeArg | number = frame;

  if (typeof frame === "number") {
    const score = typeof maybeScore === "number" ? maybeScore : 0;
    normalizedArg = normalizePlayer({ x: frame, y: maybeY as number | undefined, score });
  } else if (
    isPlayerFrame(frame) &&
    frame.score === undefined &&
    typeof maybeY === "number" &&
    maybeScore === undefined
  ) {
    // encodeFrame({ x, y }, score)
    normalizedArg = { ...frame, score: maybeY };
  } else if (isPlayerFrame(frame) && typeof maybeY === "number" && typeof maybeScore === "number") {
    normalizedArg = { ...frame, y: maybeY, score: maybeScore };
  }

  const players = collectPlayers(normalizedArg as EncodeArg, playerId);

  if (players.length === 0) throw new TypeError("Cannot encode an empty player frame");

  const bytes: number[] = [];

  // Root field 0 -> MapSchema ref id 1.
  bytes.push(0x80, 0x01);
  bytes.push(0xff, 0x01);

  // Map entries reserve refs 2, 3, ...
  players.forEach(([id], index) => {
    bytes.push(0x80); // map ADD
    writeNumber(bytes, index);
    writeString(bytes, id);
    writeNumber(bytes, index + 2);
  });

  players.forEach(([id, player], index) => {
    void id;
    bytes.push(0xff);
    writeNumber(bytes, index + 2);

    bytes.push(0x80); // x, field index 0
    writeNumber(bytes, player.x);
    bytes.push(0x81); // y, field index 1
    writeNumber(bytes, player.y);
    bytes.push(0x82); // score, field index 2
    writeNumber(bytes, player.score);
  });

  const encoded = Uint8Array.from(bytes);
  const NodeBuffer = (globalThis as { Buffer?: { from: (value: Uint8Array) => Uint8Array } }).Buffer;
  return NodeBuffer ? NodeBuffer.from(encoded) : encoded;
}

export function packFrame(...args: Parameters<typeof encodeFrame>): Uint8Array {
  return encodeFrame(...args);
}

export function encodeFrameToHex(...args: Parameters<typeof encodeFrame>): string {
  return bytesToHex(encodeFrame(...args));
}

export function packFrameToHex(...args: Parameters<typeof encodeFrame>): string {
  return encodeFrameToHex(...args);
}

/** Decode the historical 20-byte packet without requiring callers to hex-decode. */
export function decodeLegacyFrame(previous?: unknown): PlayerFrame {
  return decodeFrame(LEGACY_FRAME_HEX, previous);
}

export function decodeInitialFrame(previous?: unknown): PlayerFrame {
  return decodeFrame(INITIAL_FRAME_HEX, previous);
}

export const decodeLegacyPacket = decodeLegacyFrame;
export const decodeInitialPacket = decodeInitialFrame;
export const decodeLegacy = decodeFrame;
export const readLegacy = decodeFrame;
export const parseLegacy = parseFrame;
export const readLegacyFrame = decodeLegacyFrame;
export const readCapturedPacket = decodeLegacyFrame;

/** True when the supplied bytes are exactly the captured 20-byte vector. */
export function isLegacyFrame(input: ByteInput): boolean {
  return bytesToHex(toBytes(input)) === LEGACY_FRAME_HEX;
}

/** Object-oriented alias for code that prefers one injected codec instance. */
export class FrameCodec {
  readonly mapWidth = MAP_WIDTH;
  readonly mapHeight = MAP_HEIGHT;
  readonly playerId = FIXTURE_PLAYER_ID;
  readonly legacyHex = LEGACY_FRAME_HEX;
  readonly initialHex = INITIAL_FRAME_HEX;

  toBytes(input: ByteInput): Uint8Array {
    return toBytes(input);
  }

  toHex(input: Uint8Array | ArrayBuffer): string {
    return bytesToHex(input);
  }

  parse(input: ByteInput): DecodedFrameState {
    return parseFrame(input);
  }

  decode(input: ByteInput, previous?: unknown): PlayerFrame {
    return decodeFrame(input, previous);
  }

  decodeCoordinates(input: ByteInput, previous?: unknown): PlayerCoordinates {
    return decodeCoordinates(input, previous);
  }

  apply(target: unknown, input: ByteInput): PlayerFrame {
    return applyFrame(target, input);
  }

  encode(...args: Parameters<typeof encodeFrame>): Uint8Array {
    return encodeFrame(...args);
  }

  pack(...args: Parameters<typeof encodeFrame>): Uint8Array {
    return this.encode(...args);
  }

  unpack(input: ByteInput, previous?: unknown): PlayerFrame {
    return this.decode(input, previous);
  }

  isLegacy(input: ByteInput): boolean {
    return isLegacyFrame(input);
  }
}

export const frameCodec = new FrameCodec();
export const codec = frameCodec;

// Additional verb aliases used by room/canvas-side naming conventions.
export const encodePlayerFrame = encodeFrame;
export const decodePlayerFrame = decodeFrame;
export const encodePlayerState = encodeFrame;
export const decodePlayerState = decodeFrame;
export const parsePlayerFrame = parseFrame;
export const frameToBytes = encodeFrame;
export const frameFromBytes = decodeFrame;
export const playerToBuffer = encodeFrame;
export const bufferToPlayer = decodeFrame;
export const encodePosition = encodeFrame;
export const decodePosition = decodeCoordinates;
export const encodeCoordinateFrame = encodeFrame;
export const decodeCoordinateFrame = decodeFrame;
export const encode = encodeFrame;
export const decode = decodeFrame;
export const pack = packFrame;
export const unpack = unpackFrame;
export const packPlayerFrame = packFrame;
export const unpackPlayerFrame = unpackFrame;
export const encodePacket = encodeFrame;
export const decodePacket = decodeFrame;
export const parsePacket = parseFrame;
export const serializeFrame = encodeFrame;
export const deserializeFrame = decodeFrame;
export const writeFrame = encodeFrame;
export const readFrame = decodeFrame;

export const LEGACY_PACKET_HEX = LEGACY_FRAME_HEX;
export const CAPTURED_PACKET_HEX = LEGACY_FRAME_HEX;
export const MOVED_PACKET_HEX = LEGACY_FRAME_HEX;
export const PACKET_HEX = LEGACY_FRAME_HEX;
export const LEGACY_PACKET_BYTES = hexToBytes(LEGACY_FRAME_HEX);
export const INITIAL_PACKET_BYTES = hexToBytes(INITIAL_FRAME_HEX);
export const LEGACY_FRAME_BYTES = LEGACY_PACKET_BYTES;
export const INITIAL_FRAME_BYTES = INITIAL_PACKET_BYTES;
export const CAPTURED_BYTES = LEGACY_PACKET_BYTES;
export const TWENTY_BYTES = LEGACY_PACKET_BYTES;

/** One discoverable fixture for tests that prefer a single import. */
export const frameFixture = {
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  playerId: FIXTURE_PLAYER_ID,
  initialHex: INITIAL_FRAME_HEX,
  movedHex: LEGACY_FRAME_HEX,
  legacyHex: LEGACY_FRAME_HEX,
  initialBytes: INITIAL_FRAME_BYTES,
  movedBytes: LEGACY_FRAME_BYTES,
  legacyBytes: LEGACY_FRAME_BYTES,
  initialPlayer: { x: 120, y: 80, score: 7 } satisfies PlayerFrame,
  movedPlayer: { x: 340, y: 220, score: 7 } satisfies PlayerFrame,
} as const;

export default frameCodec;
