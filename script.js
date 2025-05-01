import { Peer } from "https://esm.sh/peerjs@1.5.4?bundle-deps";
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
env.allowLocalModels = false;

/* ---------- DOM ---------- */
const $ = (q) => document.querySelector(q);
const UI = {
  id: $("#yourPeerId"),
  pid: $("#peerIdInput"),
  msg: $("#messageInput"),
  mic: $("#micCheckbox"),
  ai: $("#aiCheckbox"),
  tChk: $("#translateCheckbox"),
  tLbl: $("#translateLabel"),
  tBox: $("#translation"),
  load: $("#loadingIndicator"),
  translate: $("#translateCheckbox"),
  translateLbl: $("#translateLabel"),
  translateBox: $("#translation"),
  sendBtn: $("#sendButton"),
  addBtn: $("#addUserBtn"),
  uList: $("#userList"),
  msgs: $("#receivedMessages"),
  audio: $("#remoteAudio"),
};

/* ---------- Storage wrapper ---------- */
const store = {
  get: (k, d = []) => JSON.parse(localStorage.getItem(k) || "null") ?? d,
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

/* ---------- Globals ---------- */
let peer,
  peerReady = Promise.resolve();
let booting = false;
const connections = new Map();
let localStream, translator, generator;

/* ---------- Boot ---------- */
init();

async function init() {
  await bootstrapPeer();
  loadSavedMessages();
  renderUserList();

  UI.sendBtn.addEventListener("click", handleSend);
  UI.msg.addEventListener("keypress", (e) => e.key === "Enter" && handleSend());
  UI.mic.addEventListener("change", handleMicToggle);
  UI.addBtn.addEventListener("click", handleAddUser);
  setInterval(reconnectLoop, 5000);
  startTranslationCountdown();
}

/* ---------- Peer bootstrap ---------- */
async function bootstrapPeer() {
  if (booting) return peerReady;
  booting = true;
  peerReady = (async () => {
    const cached = store.get("peerId", "");
    if (cached && (await tryId(cached))) return;
    for (let len = 3; ; len++) {
      const id = randomId(len);
      if (await tryId(id)) {
        store.set("peerId", id);
        return;
      }
    }
  })();
  await peerReady;
  booting = false;
}

function randomId(len) {
  return String(Math.floor(Math.random() * 10 ** len)).padStart(len, "0");
}

async function tryId(id) {
  try {
    await establishPeer(id);
    return true;
  } catch (e) {
    console.warn("ID", id, "failed:", e?.type || e);
    return false;
  }
}

function establishPeer(id) {
  return new Promise((res, rej) => {
    let p;
    try {
      p = new Peer(id);
    } catch (e) {
      return rej(e);
    }
    if (!p || typeof p.once !== "function")
      return rej(new Error("Peer init failed"));

    peer?.destroy?.();
    peer = p;

    p.once("open", () => {
      UI.id.textContent = `Your ID: ${id}`;
      res();
    });
    p.on("error", (err) => console.warn("[Peer error]", err.type || err));

    p.on("connection", attachConn);
    p.on("call", (call) => {
      call.answer();
      call.on("stream", (s) => (UI.audio.srcObject = s));
    });
  });
}

async function ensurePeer() {
  if (!peer || peer.destroyed) await bootstrapPeer();
  else await peerReady;
}

/* ---------- User list ---------- */
function getList() {
  return store.get("userList");
}
function saveList(a) {
  store.set("userList", a);
}
function renderUserList() {
  const list = getList();
  UI.uList.innerHTML = "";
  if (!list.length) {
    UI.uList.innerHTML = "<li>No users added.</li>";
    return;
  }
  for (const id of list) {
    const online = connections.get(id)?.open;
    UI.uList.insertAdjacentHTML(
      "beforeend",
      `<li>${id}<span class="status">${online ? "●" : "○"}</span></li>`
    );
  }
}

function handleAddUser() {
  const id = UI.pid.value.trim();
  if (!id || id === peer.id) return;
  const list = getList();
  if (!list.includes(id)) {
    list.push(id);
    saveList(list);
    renderUserList();
    connect(id);
  }
  UI.pid.value = "";
}

/* ---------- Connections ---------- */
function attachConn(conn) {
  connections.set(conn.peer, conn);
  updateStatus(conn.peer, true);
  conn.on("data", (d) => displayMsg(conn.peer, d));
  conn.on("close", () => updateStatus(conn.peer, false));
  conn.on("error", () => updateStatus(conn.peer, false));
}

const lastAttempt = new Map();

async function connect(id) {
  if (id === peer.id) return;

  const now = Date.now();
  if (lastAttempt.has(id) && now - lastAttempt.get(id) < 15000) return;
  lastAttempt.set(id, now);

  await ensurePeer();

  const stale = connections.get(id);
  if (stale && !stale.open) {
    stale.close();
    connections.delete(id);
  }
  if (connections.get(id)?.open) return;

  let conn;
  try {
    conn = peer.connect(id);
  } catch (err) {
    console.warn("peer.connect() threw for", id, err);
    updateStatus(id, false);
    return;
  }
  if (!conn) {
    console.warn("peer.connect() returned undefined for", id);
    return;
  }

  conn.once("open", () => attachConn(conn));
  conn.on("error", () => {
    conn.close();
    connections.delete(id);
    updateStatus(id, false);
  });
}

function reconnectLoop() {
  for (const id of getList()) if (!connections.get(id)?.open) connect(id);
  renderUserList();
}
function updateStatus(id, on) {
  const li = [...UI.uList.children].find((el) => el.textContent.startsWith(id));
  if (li) li.querySelector(".status").textContent = on ? "●" : "○";
}

/* ---------- Messaging ---------- */
function handleSend() {
  const txt = UI.msg.value.trim();
  if (!txt) return;
  for (const c of connections.values()) if (c.open) c.send(txt);
  displayMsg("You", txt);
  UI.msg.value = "";
  if (UI.ai.checked) aiRespond(txt);
}
async function displayMsg(sender, txt, skip = false) {
  if (UI.msgs.firstElementChild?.textContent.startsWith("No"))
    UI.msgs.innerHTML = "";
  const t = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (
    !!translator &&
    store.get("autoTranslate", false) &&
    typeof txt === "string"
  )
    txt = `${await translate(txt)} (${txt})`;
  UI.msgs.insertAdjacentHTML(
    "afterbegin",
    `<li><small>[${t}]</small> <strong>${sender}:</strong> <span>${txt}</span></li>`
  );
  if (!skip) saveMsg({ sender: sender, text: txt, time: Date.now() });
}
function saveMsg(m) {
  const a = store.get("messages");
  a.push(m);
  store.set("messages", a);
}
function loadSavedMessages() {
  for (const m of store.get("messages")) displayMsg(m.sender, m.text, true);
}

/* ---------- Microphone ---------- */
async function handleMicToggle() {
  if (UI.mic.checked) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      for (const id of connections.keys())
        if (connections.get(id).open) peer.call(id, localStream);
    } catch (e) {
      console.error(e);
      UI.mic.checked = false;
    }
  } else {
    localStream?.getTracks().forEach((t) => t.stop());
  }
}

/* ---------- AI ---------- */
async function aiRespond(q) {
  const pipe = await loadGenerator();
  const [{ generated_text }] = await pipe(q, { max_new_tokens: 100 });
  await displayMsg("AI", generated_text);
  for (const c of connections.values())
    if (c.open) c.send(`AI: ${generated_text}`);
}
const loadGenerator = () =>
  generator ? Promise.resolve(generator) : loadModel("generator");

/* ---------- Translation ---------- */
const langMap = {
  pt: "por_Latn",
  es: "spa_Latn",
  fr: "fra_Latn",
  de: "deu_Latn",
  it: "ita_Latn",
  hi: "hin_Deva",
  zh: "zho_Hans",
  ja: "jpn_Jpan",
};
const userLang = navigator.language.slice(0, 2);
const tgtLang = langMap[userLang] ?? "eng_Latn";

async function translate(txt) {
  const run = await loadTranslator();
  const [{ translation_text }] = await run(txt, {
    src_lang: "eng_Latn",
    tgt_lang: tgtLang,
  });
  return translation_text;
}
function loadTranslator() {
  return translator ? Promise.resolve(translator) : loadModel("translate");
}

async function loadModel(type) {
  UI.load.hidden = false;
  const model =
    type === "translate"
      ? await pipeline("translation", "Xenova/nllb-200-distilled-600M")
      : await pipeline("text2text-generation", "Xenova/LaMini-Flan-T5-783M");
  UI.load.hidden = true;
  if (type === "translate") translator = model;
  else generator = model;
  return model;
}

/* ---------- Translation countdown ---------- */
function startTranslationCountdown() {
  if (tgtLang === "eng_Latn") {
    UI.translateBox.hidden = true;
    return;
  }
  const enabled = store.get("autoTranslate", false);
  UI.translate.checked = enabled;

  let sec = 10;
  const timer = setInterval(() => {
    if (--sec > 0) {
      UI.translateLbl.textContent = `Start automatic translation in ${sec}s…`;
    } else {
      clearInterval(timer);
      UI.translate.addEventListener("change", () =>
        store.set("autoTranslate", UI.translate.checked)
      );
      UI.translateLbl.textContent = store.get("autoTranslate", false)
        ? "Translating…"
        : "";
      UI.translate.disabled = true;
      if (store.get("autoTranslate", false)) translatePage();
      else UI.translate.style.display = "none";
    }
  }, 1000);
  UI.translate.addEventListener("change", () =>
    store.set("autoTranslate", UI.translate.checked)
  );
}

async function translatePage() {
  const els = [
    ...document.body.querySelectorAll("*:not(script):not(style):not(noscript)"),
  ];
  for (const el of els) {
    if (
      !el.children.length &&
      el.textContent.trim() &&
      el.textContent !== "LS"
    ) {
      const original = el.textContent;
      const translated = await translate(original);
      el.textContent = translated ? `${translated} (${original})` : original;
    }
  }
}
