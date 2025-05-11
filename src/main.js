import { UI } from "./ui.js";
import { store } from "./storage.js";
import * as peerMod from "./peer.js";
import * as ai from "./ai.js";
import * as tr from "./translation.js";
import * as audio from "./audio.js";
import * as camera from "./camera.js";
import * as screen from "./screen.js";

/* persistent status map */
const statuses = new Map();
const statusInput = document.querySelector("#statusInput");

(async () => {
  await peerMod.ensurePeer();
  const myId = store.get("peerId");

  statusInput.value = store.get("myStatus", "");
  setStatus(myId, statusInput.value);

  loadSaved();
  renderUsers();
  bindEvents(myId);
  tr.startCountdown();
  broadcastStatus(myId);
  setInterval(reconnectLoop, 5_000);
  setInterval(() => broadcastStatus(myId), 10_000);
})();

/* ---------- status helpers ---------- */
function setStatus(id, text) {
  statuses.set(id, text);
  const li = [...UI.uList.children].find(
    (el) => el.dataset.peerId === id || el.textContent.startsWith(id)
  );
  if (li) {
    let span = li.querySelector(".note");
    if (!span) {
      span = document.createElement("span");
      span.className = "note";
      li.appendChild(span);
    }
    span.textContent = text;
  }
}
function broadcastStatus(myId) {
  const txt = statusInput.value.trim();
  setStatus(myId, txt);
  store.set("myStatus", txt);
  for (const c of peerMod.getConnections().values())
    if (c.open) c.send(`STATUS:${txt}`);
}
function sendStatusTo(peerId) {
  const c = peerMod.getConnections().get(peerId);
  if (c?.open) c.send(`STATUS:${statusInput.value.trim()}`);
}

/* ---------- user list helpers ---------- */
function users() {
  return store.get("userList", []);
}
function save(u) {
  store.set("userList", u);
}
function renderUsers() {
  const list = users();
  const connections = peerMod.getConnections();

  if (!list.length) {
    UI.uList.innerHTML = "<li>No users added.</li>";
    return;
  }
  if (
    UI.uList.children.length > 0 &&
    UI.uList.children[0].textContent !== "No users added."
  ) {
    const existingIds = new Set();
    [...UI.uList.children].forEach((li) => {
      const id = li.dataset.peerId || li.textContent.split(" ")[0];
      existingIds.add(id);
      if (list.includes(id)) {
        const statusDot = li.querySelector(".status");
        const noteSpan = li.querySelector(".note");
        const isConnected = connections.get(id)?.open;
        if (statusDot) {
          statusDot.textContent = isConnected ? " ● " : " ○ ";
        }
        const currentStatus = statuses.get(id) ?? "";
        if (noteSpan && noteSpan.textContent !== currentStatus) {
          noteSpan.textContent = currentStatus;
        }
      } else {
        UI.uList.removeChild(li);
      }
    });

    list.forEach((id) => {
      if (!existingIds.has(id)) {
        const isConnected = connections.get(id)?.open;
        const status = statuses.get(id) ?? "";

        const li = document.createElement("li");
        li.dataset.peerId = id;
        li.innerHTML = `${id} <span class="status"> ${
          isConnected ? "●" : "○"
        } </span><span class="note"> ${status}</span>`;

        UI.uList.appendChild(li);
      }
    });
  } else {
    UI.uList.innerHTML = list
      .map((id) => {
        const on = connections.get(id)?.open;
        const note = statuses.get(id) ?? "";
        return `<li data-peer-id="${id}">${id} <span class="status"> ${
          on ? "●" : "○"
        } </span><span class="note"> ${note}</span></li>`;
      })
      .join("");
  }
}
function updateConnDot(id, on) {
  const li = [...UI.uList.children].find(
    (el) => el.dataset.peerId === id || el.textContent.startsWith(id)
  );
  if (li) li.querySelector(".status").textContent = on ? " ● " : " ○ ";
  if (on) sendStatusTo(id);
  if (!on) {
    audio.handleAudioFlag(id, false);
    camera.removeRemoteVideo(id);
    screen.removeRemoteScreen(id);
  }
}

/* ---------- event wiring ---------- */
function bindEvents(myId) {
  UI.sendBtn.addEventListener("click", onSend);
  UI.msg.addEventListener("keypress", (e) => e.key === "Enter" && onSend());
  UI.addBtn.addEventListener("click", addUser);
  UI.mic.addEventListener("change", audio.toggle);
  statusInput.addEventListener("input", () => broadcastStatus(myId));

  camera.init();
  screen.init();

  peerMod.on("message", ({ from, data }) => {
    if (data === "AUDIO_ON") {
      audio.handleAudioFlag(from, true);
      return;
    }
    if (data === "AUDIO_OFF") {
      audio.handleAudioFlag(from, false);
      return;
    }
    if (data === "VIDEO_ON") {
      camera.handleVideoStatus(from, true);
      return;
    }
    if (data === "VIDEO_OFF") {
      camera.handleVideoStatus(from, false);
      return;
    }
    if (data === "SCREEN_ON") {
      screen.handleScreenStatus(from, true);
      return;
    }
    if (data === "SCREEN_OFF") {
      screen.handleScreenStatus(from, false);
      return;
    }
    if (typeof data === "string" && data.startsWith("STATUS:")) {
      setStatus(from, data.slice(7));
      return;
    }
    show(from, data);
  });

  peerMod.on("videocall", ({ call, from }) => {
    camera.handleVideoCall(call, from);
  });

  peerMod.on("screencall", ({ call, from }) => {
    screen.handleScreenCall(call, from);
  });

  peerMod.on("opened", ({ conn }) => {
    sendStatusTo(conn.peer);
    if (UI.camera.checked) {
      camera.shareVideoWithPeer(conn.peer);
    }
    if (UI.screen.checked) {
      screen.shareScreenWithPeer(conn.peer);
    }
  });

  peerMod.on("status", ({ id, online }) => updateConnDot(id, online));
}

function addUser() {
  const id = UI.pid.value.trim();
  if (!id || id === store.get("peerId")) return;
  const list = users();
  if (!list.includes(id)) {
    list.push(id);
    save(list);
    renderUsers();
    peerMod.connect(id);
  }
  UI.pid.value = "";
}

/* ---------- messaging ---------- */
async function onSend() {
  const txt = UI.msg.value.trim();
  if (!txt) return;
  for (const c of peerMod.getConnections().values()) if (c.open) c.send(txt);
  const out = UI.ai.checked ? await ai.answer(txt) : txt;
  await show("You", out);
  UI.msg.value = "";
}
async function show(sender, txt, skip = false) {
  txt = await tr.maybeTranslate(txt);
  if (UI.msgs.firstElementChild?.textContent.startsWith("No"))
    UI.msgs.innerHTML = "";
  const t = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  UI.msgs.insertAdjacentHTML(
    "afterbegin",
    `<li><small>[${t}]</small> <strong>${sender}:</strong> <span>${txt}</span></li>`
  );
  if (!skip) saveMsg({ sender, text: txt, time: Date.now() });
}

/* ---------- persistence ---------- */
function saveMsg(m) {
  const arr = store.get("messages", []);
  arr.push(m);
  store.set("messages", arr);
}
function loadSaved() {
  for (const m of store.get("messages", [])) show(m.sender, m.text, true);
}

/* ---------- reconnect loop ---------- */
function reconnectLoop() {
  for (const id of users())
    if (!peerMod.getConnections().get(id)?.open) peerMod.connect(id);
  renderUsers();
  camera.recoverVideos();
  screen.recoverScreens();

  if (UI.camera.checked) {
    for (const [peerId, conn] of peerMod.getConnections().entries()) {
      if (conn.open && !camera.isSharing(peerId)) {
        camera.shareVideoWithPeer(peerId);
      }
    }
  }

  if (UI.screen.checked) {
    for (const [peerId, conn] of peerMod.getConnections().entries()) {
      if (conn.open && !screen.isSharing(peerId)) {
        screen.shareScreenWithPeer(peerId);
      }
    }
  }
}
