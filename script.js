import { Peer } from "https://esm.sh/peerjs@1.5.4?bundle-deps";
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
env.allowLocalModels = false;

let translator, generator, peer, conn, currentDate;
let maxDigits = 1000;

async function createPeer() {
  const storedPeerId = JSON.parse(localStorage.getItem("peerId"));
  let peerId;
  if (conn) conn.close();
  if (peer) peer.destroy();
  try {
    peerId = storedPeerId || generateRandomId(maxDigits);
    peer = new Peer(peerId);
    await new Promise((resolve, reject) => {
      peer.on("open", (id) => {
        localStorage.setItem("peerId", JSON.stringify(id));
        resolve(id);
      });
      peer.on("error", reject);
    });
    peer.on("connection", (incomingConn) => {
      conn = incomingConn;
      setupConnection();
    });
    console.info("Peer created with ID:", peer.id);
    document.getElementById("yourPeerId").innerText = `Your ID: ${peer.id}`;
  } catch (error) {
    maxDigits *= 10;
    console.error(error);
    localStorage.removeItem("peerId");
    await createPeer();
  }
}

createPeer()
  .then(() => {
    console.info("Peer ready to use.");
  })
  .catch(console.error);

function generateRandomId(max = 1000) {
  return JSON.stringify(Math.floor(Math.random() * max));
}

peer.on("open", (id) => {
  document.getElementById("yourPeerId").innerText = `Your ID: ${id}`;
});

window.onload = () => {
  loadMessages();
};

const sendMessage = async () => {
  const peerId = document.getElementById("peerIdInput").value;
  const message = document.getElementById("messageInput").value;
  const aiCheckbox = document.getElementById("aiCheckbox");
  if (!conn) {
    conn = peer.connect(peerId);
    setupConnection(peerId);
  }
  if (message) {
    conn.send(message);
    displayMessage("You", message);
    document.getElementById("messageInput").value = "";
    if (aiCheckbox.checked) {
      const aiResponse = await answerQuestion(message);
      let answer = aiResponse[0].generated_text;
      if (translateCheckbox.checked) {
        answer = `${await translate(answer)} (${answer})`;
      }
      displayAIResponse(answer);
      conn.send(`AI: ${answer}`);
    }
  }
};

function displayAIResponse(response) {
  const receivedMessages = document.getElementById("receivedMessages");
  const messageObject = {
    sender: "AI",
    message: response,
    timestamp: new Date().toISOString(),
  };
  addMessageToLocalStorage(messageObject);
  updateMessageDisplay();
  receivedMessages.innerHTML += `<li><small>[${new Date().toLocaleTimeString()}]</small> <strong>AI:</strong> <span>${response}</span></li>`;
}

document.getElementById("sendButton").addEventListener("click", sendMessage);

document
  .getElementById("messageInput")
  .addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      document.getElementById("sendButton").click();
      event.preventDefault();
    }
  });

function setupConnection(otherUser) {
  conn.on("open", () => {
    console.info("P2P connection established successfully.");
  });
  conn.on("data", async (data) => {
    let message = translateCheckbox.checked
      ? `${await translate(data)} (${data})`
      : data;
    displayMessage(otherUser ?? conn.peer, message);
  });
}

function displayMessage(sender, message) {
  const receivedMessages = document.getElementById("receivedMessages");
  if (receivedMessages.innerHTML == "No messages :(") {
    receivedMessages.innerHTML = "";
  }
  const messageObject = {
    sender: sender,
    message: message,
    timestamp: new Date().toISOString(),
  };
  addMessageToLocalStorage(messageObject);
  updateMessageDisplay();
}

function addMessageToLocalStorage(messageObject) {
  let messages = JSON.parse(localStorage.getItem("messages")) || [];
  messages.push(messageObject);
  localStorage.setItem("messages", JSON.stringify(messages));
}

function loadMessages() {
  const messages = JSON.parse(localStorage.getItem("messages")) || [];
  messages.reverse().forEach((msg) => {
    const date = new Date(msg.timestamp);
    const dateString = date.toLocaleDateString();
    const timeString = date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "numeric",
    });
    const receivedMessages = document.getElementById("receivedMessages");
    if (receivedMessages.innerHTML == "No messages :(") {
      receivedMessages.innerHTML = "";
    }
    if (currentDate !== dateString) {
      receivedMessages.innerHTML += `<p>${dateString}</p>`;
      currentDate = dateString;
    }
    receivedMessages.innerHTML += `<li><small>[${timeString}]</small> <strong>${msg.sender}:</strong> <span>${msg.message}</span></li>`;
  });
}

function updateMessageDisplay() {
  const receivedMessages = document.getElementById("receivedMessages");
  receivedMessages.innerHTML = "";
  loadMessages();
}

peer.on("connection", (incomingConn) => {
  conn = incomingConn;
  setupConnection();
});

async function loadModel(model = "translate") {
  if (model === "translate" && !translator) {
    translator = await pipeline(
      "translation",
      "Xenova/nllb-200-distilled-600M"
    );
  } else if (model === "generator" && !generator) {
    generator = await pipeline(
      "text2text-generation",
      "Xenova/LaMini-Flan-T5-783M"
    );
  }
}

async function translate(message) {
  await loadModel("translate");
  const output = await translator(message, {
    src_lang: srcLang,
    tgt_lang: tgtLang,
  });
  return output[0]?.translation_text;
}

async function answerQuestion(question) {
  await loadModel("generator");
  let output = await generator(question, { max_new_tokens: 100 });
  return output;
}

const userLang = navigator.language || navigator.userLanguage;
const userLangCode = userLang.substring(0, 2);
const srcLang = "eng_Latn";
let tgtLang = "";
switch (userLangCode) {
  case "pt":
    tgtLang = "por_Latn";
    break;
  case "es":
    tgtLang = "spa_Latn";
    break;
  case "fr":
    tgtLang = "fra_Latn";
    break;
  case "de":
    tgtLang = "deu_Latn";
    break;
  case "it":
    tgtLang = "ita_Latn";
    break;
  case "hi":
    tgtLang = "hin_Deva";
    break;
  case "zh":
    tgtLang = "zho_Hans";
    break;
  case "jp":
    tgtLang = "jpn_Jpan";
    break;
  default:
    tgtLang = `eng_Latn`;
}

async function loadPageTranslation() {
  const elements = document.querySelectorAll("body *");
  const textsToTranslate = [];
  elements.forEach((el) => {
    if (
      el.nodeName.toLowerCase() !== "script" &&
      el.nodeName.toLowerCase() !== "style" &&
      el.nodeName.toLowerCase() !== "noscript" &&
      el.innerText.trim() !== "" &&
      el.children.length === 0 &&
      typeof el.innerText === "string" &&
      el.innerText !== "LS"
    ) {
      textsToTranslate.push(el);
    }
  });
  for (let i = 0; i < textsToTranslate.length; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await translateElement(textsToTranslate[i]);
  }
}

async function translateElement(el) {
  const originalText = el.innerText;
  const translatedText = await translate(originalText);
  el.innerText = `${translatedText} (${originalText})`;
}

let countdown = 10;
const translateLabel = document.getElementById("translateLabel");
const translateCheckbox = document.getElementById("translateCheckbox");
const translation = document.getElementById("translation");

function startTranslatingCountdown() {
  if (tgtLang === "eng_Latn") {
    translateCheckbox.style.display = "none";
  } else {
    const isTranslating = localStorage.getItem("isTranslating") === "true";
    translateCheckbox.checked = isTranslating;
    const interval = setInterval(() => {
      if (countdown > 0) {
        translateLabel.innerText = `Load translation in ${countdown} seconds...`;
        countdown--;
      } else {
        clearInterval(interval);
        if (translateCheckbox.checked) {
          loadPageTranslation();
          translateLabel.innerText = "Translation activated.";
        } else {
          translation.style.display = "none";
        }
        translateCheckbox.style.display = "none";
        localStorage.setItem("isTranslating", translateCheckbox.checked);
      }
    }, 1000);
  }
}

startTranslatingCountdown();
