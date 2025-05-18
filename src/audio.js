import { UI } from "./ui.js";
import { getConnections, getPeer } from "./peer.js";

/* ---------------- state ---------------- */
let stream = null;
const listeners = new Set();

/* ------------- helpers -------------- */
function updateLabel() {
  UI.micLabel.textContent = UI.mic.checked
    ? `Microphone (${listeners.size})`
    : "Microphone";
}
function broadcast(msg) {
  for (const c of getConnections().values()) if (c.open) c.send(msg);
}

/* ------------- public --------------- */
export async function toggle() {
  if (UI.mic.checked) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const peer = getPeer();
      for (const id of getConnections().keys()) peer.call(id, stream);
      broadcast("AUDIO_ON");
    } catch (e) {
      console.error(e);
      UI.mic.checked = false;
    }
  } else {
    stream?.getTracks().forEach((t) => t.stop());
    broadcast("AUDIO_OFF");
  }
  updateLabel();
}

export function handleAudioFlag(id, on) {
  on ? listeners.add(id) : listeners.delete(id);
  updateLabel();

  if (UI.mic.checked && listeners.size === 0) {
    UI.mic.checked = false;
    toggle();
  }
}

export function isActive() {
  return !!stream && UI.mic.checked;
}
