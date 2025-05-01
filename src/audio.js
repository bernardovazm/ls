import { UI } from "./ui.js";
import { getConnections } from "./peer.js";

let stream = null;

export async function toggle() {
  if (UI.mic.checked) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      for (const [id, c] of getConnections())
        if (c.open) c.peer.call(id, stream);
    } catch (e) {
      console.error(e);
      UI.mic.checked = false;
    }
  } else {
    stream?.getTracks().forEach((t) => t.stop());
  }
}
