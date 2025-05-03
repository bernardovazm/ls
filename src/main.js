import { UI } from "./ui.js";
import { store } from "./storage.js";
import * as peerMod from "./peer.js";
import * as ai from "./ai.js";
import * as tr from "./translation.js";
import * as audio from "./audio.js";

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
  const li = [...UI.uList.children].find((el) => el.textContent.startsWith(id));
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
  UI.uList.innerHTML = list.length
    ? list
        .map((id) => {
          const on = peerMod.getConnections().get(id)?.open;
          const note = statuses.get(id) ?? "";
          return `<li>${id} <span class="status"> ${
            on ? "●" : "○"
          } </span><span class="note"> ${note}</span></li>`;
        })
        .join("")
    : "<li>No users added.</li>";
}
function updateConnDot(id, on) {
  const li = [...UI.uList.children].find((el) => el.textContent.startsWith(id));
  if (li) li.querySelector(".status").textContent = on ? "●" : "○";
  if (on) sendStatusTo(id);
  if (!on) audio.handleAudioFlag(id, false);
}

/* ---------- event wiring ---------- */
function bindEvents(myId) {
  UI.sendBtn.addEventListener("click", onSend);
  UI.msg.addEventListener("keypress", (e) => e.key === "Enter" && onSend());
  UI.addBtn.addEventListener("click", addUser);
  UI.mic.addEventListener("change", audio.toggle);
  statusInput.addEventListener("input", () => broadcastStatus(myId));

  peerMod.on("message", ({ from, data }) => {
    if (data === "AUDIO_ON") {
      audio.handleAudioFlag(from, true);
      return;
    }
    if (data === "AUDIO_OFF") {
      audio.handleAudioFlag(from, false);
      return;
    }
    if (typeof data === "string" && data.startsWith("STATUS:")) {
      setStatus(from, data.slice(7));
      return;
    }
    if (typeof data === "string" && data.startsWith("STATUS:")) {
      setStatus(from, data.slice(7));
      return;
    }
    show(from, data);
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
}
