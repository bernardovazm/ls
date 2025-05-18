import { UI } from "./ui.js";
import * as peerMod from "./peer.js";

let screenStream = null;
const screenSenders = new Map();
const activeScreenStreams = new Map();
export function init() {
  UI.screen.addEventListener("change", toggleScreen);
}

async function toggleScreen() {
  if (UI.screen.checked) {
    await startScreenShare();
  } else {
    stopScreenShare();
  }
}

async function startScreenShare() {
  try {
    UI.loading.removeAttribute("hidden");

    screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: "always",
      },
      audio: false,
    });

    UI.screenVideo.srcObject = screenStream;
    UI.screenContainer.removeAttribute("hidden");

    shareScreenWithPeers();

    broadcastScreenStatus(true);

    screenStream.getVideoTracks()[0].addEventListener("ended", () => {
      UI.screen.checked = false;
      stopScreenShare();
    });

    UI.loading.setAttribute("hidden", "");
  } catch (error) {
    console.error("Error starting screen sharing:", error);
    UI.screen.checked = false;
    UI.loading.setAttribute("hidden", "");

    if (error.name !== "NotAllowedError" && error.name !== "AbortError") {
      alert("Screen sharing failed, please try again.");
    }
  }
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach((track) => track.stop());
    screenStream = null;
  }

  UI.screenVideo.srcObject = null;
  UI.screenContainer.setAttribute("hidden", "");

  stopSharingScreenWithPeers();

  broadcastScreenStatus(false);
}

function shareScreenWithPeers() {
  if (!screenStream) return;

  for (const [peerId, conn] of peerMod.getConnections().entries()) {
    if (conn.open) {
      shareScreenWithPeer(peerId);
    }
  }
}

export function shareScreenWithPeer(peerId) {
  if (!screenStream || !peerId) return null;

  const conn = peerMod.getConnections().get(peerId);
  if (!conn?.open) return null;

  conn.send("SCREEN_ON");

  const call = peerMod.callPeer(peerId, screenStream, { type: "screen" });
  if (call) {
    screenSenders.set(peerId, call);
    return call;
  }

  return null;
}

function stopSharingScreenWithPeers() {
  for (const call of screenSenders.values()) {
    call.close();
  }
  screenSenders.clear();
}

function broadcastScreenStatus(enabled) {
  for (const conn of peerMod.getConnections().values()) {
    if (conn.open) {
      conn.send(enabled ? "SCREEN_ON" : "SCREEN_OFF");
    }
  }
}

export function handleScreenCall(call, peerId) {
  call.answer();
  call.on("stream", (stream) => {
    addRemoteScreen(peerId, stream);
  });
}

function addRemoteScreen(peerId, stream) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  if (!userItem.dataset.peerId) {
    userItem.dataset.peerId = peerId;
  }

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

  if (video.srcObject !== stream) {
    video.srcObject = stream;

    activeScreenStreams.set(peerId, stream);

    video.addEventListener("loadedmetadata", () => {
      screenContainer.classList.add("active");
    });

    video.addEventListener("ended", () => {
      removeRemoteScreen(peerId);
      activeScreenStreams.delete(peerId);
    });
  }

  return screenContainer;
}

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

export function handleScreenStatus(peerId, enabled) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  if (!enabled) {
    removeRemoteScreen(peerId);
  }
}

export function isSharing(peerId) {
  return screenSenders.has(peerId);
}

export function recoverScreens() {
  activeScreenStreams.forEach((stream, peerId) => {
    if (stream.active) {
      addRemoteScreen(peerId, stream);
    } else {
      activeScreenStreams.delete(peerId);
    }
  });
}
