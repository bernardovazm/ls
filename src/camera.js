import { UI } from "./ui.js";
import * as peerMod from "./peer.js";

let localStream = null;
const videoSenders = new Map();
export function init() {
  UI.camera.addEventListener("change", toggleCamera);
  UI.cameraSelect.addEventListener("change", startCamera);
}
async function toggleCamera() {
  if (UI.camera.checked) {
    await detectCameras();
  } else {
    stopCamera();
  }
}
async function detectCameras() {
  try {
    UI.loading.removeAttribute("hidden");
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter(
      (device) => device.kind === "videoinput"
    );

    if (videoDevices.length === 0) {
      alert("No camera devices found");
      UI.camera.checked = false;
      UI.loading.setAttribute("hidden", "");
      return;
    }

    if (videoDevices.length === 1) {
      await startCamera(videoDevices[0].deviceId);
    } else {
      UI.cameraSelect.innerHTML =
        '<option value="" disabled selected>Choose a device</option>';
      videoDevices.forEach((device) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Camera ${UI.cameraSelect.length}`;
        UI.cameraSelect.appendChild(option);
      });
      UI.cameraOptions.removeAttribute("hidden");
    }
    UI.loading.setAttribute("hidden", "");
  } catch (error) {
    console.error("Error accessing media devices:", error);
    UI.camera.checked = false;
    UI.loading.setAttribute("hidden", "");
    alert("Error accessing camera. Please check permissions.");
  }
}
async function startCamera(deviceId) {
  try {
    if (typeof deviceId === "object") {
      deviceId = UI.cameraSelect.value;
    }
    if (localStream) {
      stopCamera();
    }
    const constraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
    };
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    UI.localVideo.srcObject = localStream;
    UI.localVideoContainer.removeAttribute("hidden");
    shareVideoWithPeers();
    broadcastVideoStatus(true);
  } catch (error) {
    console.error("Error starting camera:", error);
    UI.camera.checked = false;
    alert("Failed to start camera. Please try again.");
  }
}
function stopCamera() {
  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  UI.localVideo.srcObject = null;
  UI.localVideoContainer.setAttribute("hidden", "");
  UI.cameraOptions.setAttribute("hidden", "");
  stopSharingWithPeers();
  broadcastVideoStatus(false);
}
function shareVideoWithPeers() {
  if (!localStream) return;

  for (const [peerId, conn] of peerMod.getConnections().entries()) {
    if (conn.open) {
      const call = peerMod.callPeer(peerId, localStream, { type: "video" });
      if (call) {
        videoSenders.set(peerId, call);
      }
    }
  }
}
function stopSharingWithPeers() {
  for (const call of videoSenders.values()) {
    call.close();
  }
  videoSenders.clear();
}
function broadcastVideoStatus(enabled) {
  for (const conn of peerMod.getConnections().values()) {
    if (conn.open) {
      conn.send(enabled ? "VIDEO_ON" : "VIDEO_OFF");
    }
  }
}
export function handleVideoCall(call, peerId) {
  call.answer();
  call.on("stream", (stream) => {
    addRemoteVideo(peerId, stream);
  });
}
function addRemoteVideo(peerId, stream) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;
  if (!userItem.dataset.peerId) {
    userItem.dataset.peerId = peerId;
  }
  let videoContainer = userItem.querySelector(".remote-video-container");

  if (!videoContainer) {
    videoContainer = document.createElement("div");
    videoContainer.className = "remote-video-container";
    videoContainer.dataset.peerId = peerId;
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    videoContainer.appendChild(video);
    userItem.appendChild(videoContainer);
  }

  const video = videoContainer.querySelector("video");
  if (video.srcObject !== stream) {
    video.srcObject = stream;
    activeStreams.set(peerId, stream);
    video.addEventListener("loadedmetadata", () => {
      videoContainer.classList.add("active");
    });

    video.addEventListener("ended", () => {
      removeRemoteVideo(peerId);
      activeStreams.delete(peerId);
    });
  }

  return videoContainer;
}
const activeStreams = new Map();
export function removeRemoteVideo(peerId) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  const videoContainer = userItem.querySelector(".remote-video-container");
  if (videoContainer) {
    userItem.removeChild(videoContainer);
  }

  activeStreams.delete(peerId);
}
export function handleVideoStatus(peerId, enabled) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.startsWith(peerId)
  );
  if (!userItem) return;

  if (!enabled) {
    removeRemoteVideo(peerId);
  }
}
export function shareVideoWithPeer(peerId) {
  if (!localStream || !peerId) return null;

  const conn = peerMod.getConnections().get(peerId);
  if (!conn?.open) return null;
  if (localStream) {
    conn.send("VIDEO_ON");
    const call = peerMod.callPeer(peerId, localStream, { type: "video" });
    if (call) {
      videoSenders.set(peerId, call);
      return call;
    }
  }

  return null;
}
export function isSharing(peerId) {
  return videoSenders.has(peerId);
}
export function recoverVideos() {
  activeStreams.forEach((stream, peerId) => {
    if (stream.active) {
      addRemoteVideo(peerId, stream);
    } else {
      activeStreams.delete(peerId);
    }
  });
}

export function isActive() {
  return !!localStream && UI.camera.checked;
}
