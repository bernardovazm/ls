import { UI, $ } from "./ui.js";
import { store } from "./storage.js";
import * as peerMod from "./peer.js";
import * as ai from "./ai.js";
import * as tr from "./translation.js";
import * as audio from "./audio.js";

/* ---------- boot ---------- */
await peerMod.ensurePeer();
loadSaved();
renderUsers();
bindEvents();
tr.startCountdown();
setInterval(reconnectLoop, 5000);

/* ---------- events ---------- */
function bindEvents() {
  UI.sendBtn.addEventListener("click", onSend);
  UI.msg.addEventListener("keypress", (e) => e.key === "Enter" && onSend());
  UI.addBtn.addEventListener("click", addUser);
  UI.mic.addEventListener("change", audio.toggle);

  peerMod.on("message", ({ from, data }) => show(from, data));
  peerMod.on("status", ({ id, online }) => updateStatus(id, online));
}

/* ---------- user list helpers ---------- */
function users() {
  return store.get("userList");
}
function save(u) {
  store.set("userList", u);
}
function renderUsers() {
  const list = users();
  UI.uList.innerHTML = list.length
    ? list
        .map(
          (id) =>
            `<li>${id}<span class="status">${
              peerMod.getConnections().get(id)?.open ? "●" : "○"
            }</span></li>`
        )
        .join("")
    : "<li>No users added.</li>";
}
function addUser() {
  const id = UI.pid.value.trim();
  if (!id || id === peerMod.getConnections().id) return;
  const list = users();
  if (!list.includes(id)) {
    list.push(id);
    save(list);
    renderUsers();
    peerMod.connect(id);
  }
  UI.pid.value = "";
}
function updateStatus(id, on) {
  const li = [...UI.uList.children].find((el) => el.textContent.startsWith(id));
  if (li) li.querySelector(".status").textContent = on ? "●" : "○";
}

/* ---------- messaging ---------- */
async function onSend() {
  const text = UI.msg.value.trim();
  if (!text) return;
  for (const c of peerMod.getConnections().values()) if (c.open) c.send(text);
  const out = UI.ai.checked ? await ai.answer(text) : text;
  show("You", out);
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

/* ---------- storage of messages ---------- */
function saveMsg(m) {
  const arr = store.get("messages");
  arr.push(m);
  store.set("messages", arr);
}
function loadSaved() {
  for (const m of store.get("messages")) show(m.sender, m.text, true);
}

/* ---------- reconnect loop ---------- */
function reconnectLoop() {
  for (const id of users())
    if (!peerMod.getConnections().get(id)?.open) peerMod.connect(id);
  renderUsers();
}
