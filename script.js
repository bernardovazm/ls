import { Peer } from "https://esm.sh/peerjs@1.5.4?bundle-deps";
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
env.allowLocalModels = false;

/* ---------- DOM helpers ---------- */
const $ = (q) => document.querySelector(q);
const UI = {
  idLabel: $("#yourPeerId"),
  peerIdInput: $("#peerIdInput"),
  msgInput: $("#messageInput"),
  mic: $("#micCheckbox"),
  ai: $("#aiCheckbox"),
  translate: $("#translateCheckbox"),
  translateLbl: $("#translateLabel"),
  translateBox: $("#translation"),
  loading: $("#loadingIndicator"),
  messages: $("#receivedMessages"),
  send: $("#sendButton"),
  remoteAudio: $("#remoteAudio"),
};

/* ---------- Storage wrapper ---------- */
const store = {
  get: (k, d = null) => JSON.parse(localStorage.getItem(k) || "null") ?? d,
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};

/* ---------- Random-ID helpers ---------- */
function randomDigits(len) {
  return String(Math.floor(Math.random() * 10 ** len)).padStart(len, "0");
}

/* ---------- Globals ---------- */
let peer, conn, call, localStream;
let translator, generator;

/* ---------- Init ---------- */
init();

async function init() {
  await createUniquePeer();
  loadSavedMessages();

  UI.send.addEventListener("click", handleSend);
  UI.msgInput.addEventListener(
    "keypress",
    (e) => e.key === "Enter" && handleSend()
  );
  UI.mic.addEventListener("change", handleMicToggle);

  startTranslationCountdown();
}

/* ---------- PeerJS ---------- */
async function createUniquePeer() {
  const cached = store.get("peerId");
  if (cached) {
    try {
      await establishPeer(cached);
      return;
    } catch (err) {
      console.error(err);
    }
  }

  let length = 3;
  while (true) {
    const candidate = randomDigits(length);
    try {
      await establishPeer(candidate);
      store.set("peerId", candidate);
      return;
    } catch (err) {
      if (err?.type === "unavailable-id") length++;
      else {
        console.error(err);
        length++;
      }
    }
  }
}

function establishPeer(id) {
  return new Promise((resolve, reject) => {
    peer = new Peer(id);
    peer.once("open", () => {
      UI.idLabel.textContent = `Your ID: ${id}`;
      resolve();
    });
    peer.once("error", (e) => {
      peer.destroy();
      reject(e);
    });
    peer.on("connection", (c) => {
      conn = c;
      bindConnection();
    });
    peer.on("call", (incoming) => {
      incoming.answer();
      incoming.on("stream", (remote) => {
        UI.remoteAudio.srcObject = remote;
      });
    });
  });
}

/* ---------- Connection helpers ---------- */
function bindConnection() {
  conn.on("data", (d) => displayMessage(conn.peer, d));
}
function connectToPeer(id) {
  conn = peer.connect(id);
  conn.once("open", () => {
    console.info("Connected to", id);
    bindConnection();
  });
}

/* ---------- Messaging ---------- */
function handleSend() {
  const target = UI.peerIdInput.value.trim();
  const text = UI.msgInput.value.trim();
  if (!text) return;

  if (!conn) connectToPeer(target);
  conn?.send(text);
  displayMessage("You", text);
  UI.msgInput.value = "";

  if (UI.ai.checked) aiRespond(text);
}

function displayMessage(sender, text, skipSave = false) {
  if (UI.messages.firstElementChild?.textContent.startsWith("No"))
    UI.messages.innerHTML = "";

  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  UI.messages.insertAdjacentHTML(
    "afterbegin",
    `<li><small>[${time}]</small> <strong>${sender}:</strong> ${text}</li>`
  );

  if (!skipSave) saveMessage({ sender, text, timestamp: Date.now() });
}

function saveMessage(m) {
  const all = store.get("messages", []);
  all.push(m);
  store.set("messages", all);
}
function loadSavedMessages() {
  for (const m of store.get("messages", []))
    displayMessage(m.sender, m.text, true);
}

/* ---------- Microphone ---------- */
async function handleMicToggle() {
  if (UI.mic.checked) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (conn) call = peer.call(conn.peer, localStream);
    } catch (e) {
      console.error(e);
      UI.mic.checked = false;
    }
  } else {
    localStream?.getTracks().forEach((t) => t.stop());
    call?.close();
  }
}

/* ---------- AI ---------- */
async function aiRespond(q) {
  const pipe = await loadGenerator();
  const [{ generated_text }] = await pipe(q, { max_new_tokens: 100 });
  displayMessage("AI", generated_text);
  conn?.send(`AI: ${generated_text}`);
}
function loadGenerator() {
  return generator ? Promise.resolve(generator) : loadModel("generator");
}

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
  UI.loading.hidden = false;
  const model =
    type === "translate"
      ? await pipeline("translation", "Xenova/nllb-200-distilled-600M")
      : await pipeline("text2text-generation", "Xenova/LaMini-Flan-T5-783M");
  UI.loading.hidden = true;
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
      UI.translateLbl.textContent = enabled ? "Translating…" : "";
      UI.translate.disabled = true;
      if (enabled) translatePage();
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
