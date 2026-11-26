import '@colyseus/sdk/debug';
import { Client, Callbacks, Room } from '@colyseus/sdk';

import type { server } from './server/vite.ts';
import type { MyRoom } from './MyRoom.ts';
import { applyFrameToCanvasPlayers, drawCanvasPlayers, type CanvasPlayer } from './canvasPlayers.ts';

const logElement = document.querySelector<HTMLPreElement>('#log');
const button = document.querySelector<HTMLButtonElement>('#connect');
const statusEl = document.querySelector<HTMLSpanElement>('#status');
const canvas = document.querySelector<HTMLCanvasElement>('#game');
const ctx = canvas?.getContext('2d');

let room: Room<MyRoom> | null;
const players = new Map<string, CanvasPlayer>();

// HTTP endpoint buttons — work without a room connection
const httpClient = new Client<typeof server>(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);

document.getElementById('btn-hello')?.addEventListener('click', async () => {
  const res = await httpClient.http.get('/hello');
  log(`/hello: ${JSON.stringify(res.data)}`);
});

document.getElementById('btn-time')?.addEventListener('click', async () => {
  const res = await httpClient.http.get('/time');
  log(`/time: ${JSON.stringify(res.data)}`);
});

document.getElementById('btn-express')?.addEventListener('click', async () => {
  const res = await fetch(`${location.origin}/express-hello`);
  log(`/express-hello: ${JSON.stringify(await res.json())}`);
});

function log(message: string) {
  if (logElement) {
    logElement.textContent = message;
  }
}

function setStatus(state: 'idle' | 'connecting' | 'connected' | 'disconnected', text: string) {
  if (!statusEl) return;
  statusEl.className = state;
  statusEl.innerHTML = `<span class="dot"></span>${text}`;
}

function draw() {
  if (!ctx || !canvas) return;
  drawCanvasPlayers(ctx, canvas, players, room?.sessionId);
  requestAnimationFrame(draw);
}

button?.addEventListener('click', async () => {
  if (room) {
    room.leave();
    return;
  }

  button.textContent = 'Connecting...';
  button.disabled = true;
  setStatus('connecting', 'Connecting...');

  try {
    const client = new Client<typeof server>(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    // The registered example room is "my_room". "my_room_2" is also kept as a
    // binary-frame compatibility room for direct packet tests.
    room = await client.joinOrCreate('my_room');

    // allow reconnection immediately.
    room.reconnection.minUptime = 0;

    setStatus('connected', `Room ${room.roomId} | Session ${room.sessionId}`);
    button.textContent = 'Leave';
    button.disabled = false;

    // Sync players from state using Callbacks API
    const callbacks = Callbacks.get(room);

    callbacks.onAdd("players", (player, sessionId) => {
      players.set(sessionId, { x: player.x, y: player.y, score: player.score });
      callbacks.listen(player, "x", (value) => {
        const p = players.get(sessionId);
        if (p) p.x = value;
      });
      callbacks.listen(player, "y", (value) => {
        const p = players.get(sessionId);
        if (p) p.y = value;
      });
      callbacks.listen(player, "score", (value) => {
        const p = players.get(sessionId);
        if (p) p.score = value;
        if (sessionId === room?.sessionId) log(`score: ${value}`);
      });
      if (sessionId === room?.sessionId) {
        log(`Player joined: ${sessionId} | score: ${player.score}`);
      } else {
        log(`Player joined: ${sessionId}`);
      }
    });

    callbacks.onRemove("players", (_, sessionId) => {
      players.delete(sessionId);
      log(`Player left: ${sessionId}`);
    });

    // Binary side-channel: decode room-written bytes with the same fixture
    // codec used by compatibility tests. Schema callbacks remain authoritative
    // for ordinary state synchronization.
    room.onMessage("*", (type, bytes) => {
      if (type !== "frame_bytes") return;
      try {
        applyFrameToCanvasPlayers(
          players,
          bytes as Uint8Array | ArrayBuffer | number[],
        );
      } catch (error) {
        console.warn("Failed to decode frame_bytes", error);
      }
    });

    room.onLeave((code) => {
      setStatus('disconnected', `Disconnected (code: ${code})`);
      log(`Left room (code: ${code})`);
      button.textContent = 'Join my_room';
      button.disabled = false;
      room = null;
      players.clear();
    });

    room.onError((code, message) => {
      log(`Error ${code}: ${message}`);
    });

    // Arrow key movement
    const speed = 5;
    const keys = new Set<string>();

    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(e.key)) {
        e.preventDefault();
        keys.add(e.key);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const moveLoop = setInterval(() => {
      if (keys.size === 0 || !room) return;
      let x = 0, y = 0;
      if (keys.has('ArrowLeft') || keys.has('a')) x -= speed;
      if (keys.has('ArrowRight') || keys.has('d')) x += speed;
      if (keys.has('ArrowUp') || keys.has('w')) y -= speed;
      if (keys.has('ArrowDown') || keys.has('s')) y += speed;
      if (x !== 0 || y !== 0) {
        const me = players.get(room.sessionId);
        room.send('move', { x: (me?.x ?? 0) + x, y: (me?.y ?? 0) + y });
      }
    }, 1000 / 30);

    room.onLeave(() => {
      clearInterval(moveLoop);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });

    // Start render loop
    requestAnimationFrame(draw);

  } catch (e) {
    setStatus('disconnected', 'Connection failed');
    log(`Connection failed: ${e instanceof Error ? e.message : String(e)}`);
    button.textContent = 'Join my_room';
    button.disabled = false;
    room = null;
  }
});
