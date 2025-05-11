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

export async function changeId(newId) {
  if (!newId || newId === peer?.id)
    return { success: false, error: "ID já está em uso ou é inválido" };

  try {
    const existingConnections = new Map(connections);
    const existingPeerId = peer?.id;

    if (await tryId(newId)) {
      store.set("peerId", newId);

      for (const [oldPeerId, oldConn] of existingConnections.entries()) {
        if (oldConn.open) {
          oldConn.send(`ID_CHANGED:${existingPeerId}:${newId}`);

          setTimeout(() => {
            connect(oldPeerId);
          }, 500);
        }
      }

      return { success: true };
    } else {
      return { success: false, error: "ID não disponível" };
    }
  } catch (error) {
    console.error("Erro ao mudar ID:", error);
    return {
      success: false,
      error: "Erro ao tentar mudar o ID: " + (error.message || error),
    };
  }
}

export function updatePeerIdInUserList(oldId, newId) {
  if (!oldId || !newId) return false;

  try {
    const userList = store.get("userList", []);
    const index = userList.indexOf(oldId);

    if (index !== -1) {
      userList[index] = newId;
      store.set("userList", userList);

      const oldConn = connections.get(oldId);
      if (oldConn) {
        detach(oldId);
        connect(newId);
      }

      return true;
    }

    return false;
  } catch (error) {
    console.error("Erro ao atualizar ID na lista:", error);
    return false;
  }
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
      UI.id.textContent = id;
      res();
    });
    p.on("error", (e) => {
      console.warn("[Peer error]", e.type || e);
      rej(e);
    });
    p.on("connection", attachConn);
    p.on("call", (call) => {
      const callType = call.metadata?.type || "audio";

      if (callType === "video") {
        dispatch("videocall", { call, from: call.peer });
      } else if (callType === "screen") {
        dispatch("screencall", { call, from: call.peer });
      } else {
        call.answer();
        call.on("stream", (s) => (UI.audio.srcObject = s));
      }
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
  conn.once("open", () => {
    attachConn(conn);
    dispatch("opened", { conn });
  });
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
const listeners = {
  message: [],
  status: [],
  opened: [],
  videocall: [],
  screencall: [],
};
export function on(evt, cb) {
  if (!listeners[evt]) listeners[evt] = [];
  listeners[evt].push(cb);
}
function dispatch(evt, data) {
  listeners[evt].forEach((cb) => cb(data));
}

export function getPeer() {
  return peer;
}

export function callPeer(peerId, stream, metadata = {}) {
  if (!peer || !stream) return null;
  try {
    const call = peer.call(peerId, stream, { metadata });
    return call;
  } catch (e) {
    console.warn("[peer] call error:", e);
    return null;
  }
}
