import { Peer } from "https://esm.sh/peerjs@1.5.4?bundle-deps";
import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
env.allowLocalModels = false;

let translator,
  generator,
  isTranslatorLoading,
  isGeneratorLoading,
  peer,
  conn,
  currentDate,
  countdown = 10,
  maxDigits = 1000;

const translateLabel = document.getElementById("translateLabel");
const translateCheckbox = document.getElementById("translateCheckbox");
const translation = document.getElementById("translation");
const micCheckbox = document.getElementById("micCheckbox");
let localStream;
let call;

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
  const aiCheckbox = document.getElementById("aiCheckbox"); // Checkbox para ativar/desativar IA

  if (!conn) {
    // Cria a conexão
    conn = peer.connect(peerId);

    // Aguarda a conexão abrir antes de prosseguir
    conn.on("open", () => {
      console.log("P2P connection established successfully.");
      // Configura os eventos da conexão
      setupConnection(peerId);
      // Envia a mensagem assim que a conexão estiver aberta
      if (message) {
        conn.send(message);
        displayMessage("You", message);
        document.getElementById("messageInput").value = "";
        // Verifica se a IA está ativada e gera uma resposta
        if (aiCheckbox.checked) {
          generateAIResponse(message);
        }
      }
    });
  } else {
    // Se a conexão já existe, envia a mensagem diretamente
    if (message) {
      conn.send(message);
      displayMessage("You", message);
      document.getElementById("messageInput").value = "";
      // Verifica se a IA está ativada e gera uma resposta
      if (aiCheckbox.checked) {
        generateAIResponse(message);
      }
    }
  }
};

async function generateAIResponse(question) {
  try {
    const aiResponse = await answerQuestion(question);
    const answer = aiResponse[0].generated_text;
    displayAIResponse(answer);
    conn.send(`AI: ${answer}`);
  } catch (error) {
    console.error("Erro ao gerar resposta da IA:", error);
  }
}

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

function setupConnection(otherUser) {
  conn.on("data", (data) => {
    if (typeof data === "string") {
      displayMessage(otherUser ?? conn.peer, data);
    }
  });
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

// Configuração para receber chamadas de áudio
peer.on("call", (incomingCall) => {
  incomingCall.answer(); // Responde à chamada sem enviar áudio próprio
  incomingCall.on("stream", (remoteStream) => {
    const remoteAudio = document.getElementById("remoteAudio");
    remoteAudio.srcObject = remoteStream;
  });
});

// Gerenciamento do checkbox de microfone
micCheckbox.addEventListener("change", async () => {
  if (micCheckbox.checked) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (conn) {
        call = peer.call(conn.peer, localStream);
      } else {
        console.error("No peer connection established.");
        micCheckbox.checked = false;
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
      micCheckbox.checked = false;
    }
  } else {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      localStream = null;
    }
    if (call) {
      call.close();
      call = null;
    }
  }
});

async function loadModel(model = "translate") {
  const loadingIndicator = document.getElementById("loadingIndicator");
  loadingIndicator.style.display = "block"; // Mostra o indicativo

  if (model === "translate" && !translator && !isTranslatorLoading) {
    isTranslatorLoading = true;
    translator = await pipeline(
      "translation",
      "Xenova/nllb-200-distilled-600M"
    );
    isTranslatorLoading = false;
  } else if (model === "generator" && !generator && !isGeneratorLoading) {
    isGeneratorLoading = true;
    generator = await pipeline(
      "text2text-generation",
      "Xenova/LaMini-Flan-T5-783M"
    );
    isGeneratorLoading = false;
  }

  loadingIndicator.style.display = "none"; // Esconde o indicativo
}

async function translate(message) {
  if (typeof message !== "string") {
    return null;
  }
  try {
    await loadModel("translate");
    const output = await translator(message, {
      src_lang: srcLang,
      tgt_lang: tgtLang,
    });
    return output[0]?.translation_text;
  } catch (error) {
    console.error(error);
  }
}

async function answerQuestion(question) {
  try {
    await loadModel("generator");
    let output = await generator(question, { max_new_tokens: 100 });
    return output;
  } catch (error) {
    console.error(error);
    return question;
  }
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
    tgtLang = "eng_Latn";
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
  el.innerText = translatedText
    ? `${translatedText} (${originalText})`
    : originalText;
}

async function startTranslatingCountdown() {
  if (tgtLang === "eng_Latn") {
    translateCheckbox.style.display = "none";
  } else {
    const isTranslating = localStorage.getItem("isTranslating");
    if (isTranslating === null) {
      localStorage.setItem("isTranslating", translateCheckbox.checked);
    } else {
      translateCheckbox.checked = isTranslating === "true";
    }
    const interval = setInterval(() => {
      if (countdown > 0) {
        translateLabel.innerText = `Load automatic translation in ${countdown} seconds...`;
        countdown--;
      } else {
        clearInterval(interval);
        if (translateCheckbox.checked) {
          loadPageTranslation().then(() => {
            isTranslatorLoading = false;
          });
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
