import { Peer } from "https://esm.sh/peerjs@1.5.4?bundle-deps";
import { UI } from "./ui.js";
import { store } from "./storage.js";

let peer = null;
let peerReady = Promise.resolve();
let booting = false;
const connections = new Map();
const lastDial = new Map();

/* ---------- bootstrap & helpers ---------- */
export async function ensurePeer() {
  if (!peer || peer.destroyed) await bootstrap();
  else await peerReady;
}

export function getConnections() {
  return connections;
}

async function bootstrap() {
  if (booting) return peerReady;
  booting = true;

  peerReady = (async () => {
    const cached = store.get("peerId", "");
    if (cached && (await tryId(cached))) return;
    for (let len = 3; ; len++) {
      const id = randomDigits(len);
      if (await tryId(id)) {
        store.set("peerId", id);
        return;
      }
    }
  })();

  await peerReady;
  booting = false;
}

function randomDigits(len) {
  return String(Math.floor(Math.random() * 10 ** len)).padStart(len, "0");
}

async function tryId(id) {
  try {
    await createPeer(id);
    return true;
  } catch (e) {
    console.warn("[peer] id", id, "failed:", e?.type || e);
    return false;
  }
}

function createPeer(id) {
  return new Promise((res, rej) => {
    let p;
    try {
      p = new Peer(id);
    } catch (e) {
      return rej(e);
    }

    peer?.destroy?.();
    peer = p;

    p.once("open", () => {
      UI.id.textContent = `Your ID: ${id}`;
      res();
    });
    p.on("error", (e) => console.warn("[Peer error]", e.type || e));
    p.on("connection", attachConn);
    p.on("call", (call) => {
      call.answer();
      call.on("stream", (s) => (UI.audio.srcObject = s));
    });
  });
}

/* ---------- public dial logic ---------- */
export async function connect(id) {
  if (id === peer?.id) return;

  const now = Date.now();
  if (now - (lastDial.get(id) || 0) < 15000) return;
  lastDial.set(id, now);

  await ensurePeer();
  if (connections.get(id)?.open) return;

  let conn;
  try {
    conn = peer.connect(id);
  } catch (e) {
    console.warn("[peer] connect threw", id, e);
    return;
  }

  if (!conn) {
    console.warn("[peer] connect undefined", id);
    return;
  }

  conn.once("open", () => attachConn(conn));
  conn.on("error", () => detach(id));
}

function attachConn(conn) {
  connections.set(conn.peer, conn);
  update(conn.peer, true);
  conn.on("data", (d) => dispatch("message", { from: conn.peer, data: d }));
  conn.on("close", () => detach(conn.peer));
}

function detach(id) {
  connections.get(id)?.close();
  connections.delete(id);
  update(id, false);
}

function update(id, online) {
  dispatch("status", { id, online });
}

/* ---------- tiny event bus ---------- */
const listeners = { message: [], status: [] };
export function on(evt, cb) {
  listeners[evt].push(cb);
}
function dispatch(evt, data) {
  listeners[evt].forEach((cb) => cb(data));
}
