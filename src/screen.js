import { UI } from "./ui.js";
import * as peerMod from "./peer.js";

let screenStream = null;
const screenSenders = new Map();
const activeScreenStreams = new Map();
export function init() {
  UI.screen.addEventListener("change", toggleScreen);
}

// Alternar compartilhamento de tela
async function toggleScreen() {
  if (UI.screen.checked) {
    await startScreenShare();
  } else {
    stopScreenShare();
  }
}

// Iniciar compartilhamento de tela
async function startScreenShare() {
  try {
    UI.loading.removeAttribute("hidden");

    // Obter stream de compartilhamento de tela
    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
      },
      audio: false,
    });

    // Exibir a tela compartilhada localmente
    UI.screenVideo.srcObject = screenStream;
    UI.screenContainer.removeAttribute("hidden");

    // Enviar para peers conectados
    shareScreenWithPeers();

    // Avisar outros usuários que estamos compartilhando tela
    broadcastScreenStatus(true);

    // Adicionar listener para quando o usuário parar o compartilhamento pelo navegador
    screenStream.getVideoTracks()[0].addEventListener("ended", () => {
      UI.screen.checked = false;
      stopScreenShare();
    });

    UI.loading.setAttribute("hidden", "");
  } catch (error) {
    console.error("Erro ao iniciar compartilhamento de tela:", error);
    UI.screen.checked = false;
    UI.loading.setAttribute("hidden", "");

    // Se o usuário cancelar o diálogo, isso não é um erro real
    if (error.name !== "NotAllowedError" && error.name !== "AbortError") {
      alert("Falha ao compartilhar tela. Por favor, tente novamente.");
    }
  }
}

// Parar compartilhamento de tela
function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  // Limpar o vídeo local
  UI.screenVideo.srcObject = null;
  UI.screenContainer.setAttribute("hidden", "");

  // Parar de compartilhar com peers
  stopSharingScreenWithPeers();

  // Avisar outros usuários que paramos de compartilhar tela
  broadcastScreenStatus(false);
}

// Compartilhar tela com todos os peers conectados
function shareScreenWithPeers() {
  if (!screenStream) return;

  for (const [peerId, conn] of peerMod.getConnections().entries()) {
    if (conn.open) {
      shareScreenWithPeer(peerId);
    }
  }
}

// Compartilhar tela com um peer específico
export function shareScreenWithPeer(peerId) {
  if (!screenStream || !peerId) return null;

  const conn = peerMod.getConnections().get(peerId);
  if (!conn?.open) return null;

  // Enviar sinal de que estamos compartilhando tela
  conn.send("SCREEN_ON");

  // Fazer uma chamada de vídeo com a stream da tela
  const call = peerMod.callPeer(peerId, screenStream, { type: "screen" });
  if (call) {
    screenSenders.set(peerId, call);
    return call;
  }

  return null;
}

// Parar de compartilhar tela com todos os peers
function stopSharingScreenWithPeers() {
  for (const call of screenSenders.values()) {
    call.close();
  }
  screenSenders.clear();
}

// Enviar status de compartilhamento de tela para todos os peers
function broadcastScreenStatus(enabled) {
  for (const conn of peerMod.getConnections().values()) {
    if (conn.open) {
      conn.send(enabled ? "SCREEN_ON" : "SCREEN_OFF");
    }
  }
}

// Tratar chamada de compartilhamento de tela recebida
export function handleScreenCall(call, peerId) {
  call.answer();
  call.on("stream", (stream) => {
    addRemoteScreen(peerId, stream);
  });
}

// Adicionar tela remota à lista de usuários
function addRemoteScreen(peerId, stream) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  // Garantir que o elemento tenha o atributo de dados
  if (!userItem.dataset.peerId) {
    userItem.dataset.peerId = peerId;
  }

  // Verificar se o contêiner da tela já existe
  let screenContainer = userItem.querySelector(".remote-screen-container");

  if (!screenContainer) {
    screenContainer = document.createElement("div");
    screenContainer.className = "remote-screen-container";
    screenContainer.dataset.peerId = peerId;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    screenContainer.appendChild(video);
    userItem.appendChild(screenContainer);
  }

  const video = screenContainer.querySelector("video");

  // Definir a stream apenas se for diferente
  if (video.srcObject !== stream) {
    video.srcObject = stream;

    // Armazenar a stream para recuperação posterior
    activeScreenStreams.set(peerId, stream);

    // Adicionar event listeners para gerenciar o status do vídeo
    video.addEventListener("loadedmetadata", () => {
      // Vídeo está pronto para reprodução
      screenContainer.classList.add("active");
    });

    video.addEventListener("ended", () => {
      // Stream de vídeo terminou
      removeRemoteScreen(peerId);
      activeScreenStreams.delete(peerId);
    });
  }

  return screenContainer;
}

// Remover tela remota
export function removeRemoteScreen(peerId) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  const screenContainer = userItem.querySelector(".remote-screen-container");
  if (screenContainer) {
    userItem.removeChild(screenContainer);
  }

  activeScreenStreams.delete(peerId);
}

// Tratar mensagem de status de compartilhamento de tela
export function handleScreenStatus(peerId, enabled) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  if (!enabled) {
    removeRemoteScreen(peerId);
  }
}

// Verificar se já estamos compartilhando tela com um peer específico
export function isSharing(peerId) {
  return screenSenders.has(peerId);
}

// Recuperar telas perdidas após atualizações da lista
export function recoverScreens() {
  activeScreenStreams.forEach((stream, peerId) => {
    if (stream.active) {
      addRemoteScreen(peerId, stream);
    } else {
      activeScreenStreams.delete(peerId);
    }
  });
}
