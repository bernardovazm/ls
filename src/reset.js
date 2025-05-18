import { store } from "./storage.js";
import { UI } from "./ui.js";
import * as peerMod from "./peer.js";
import * as camera from "./camera.js";
import * as audio from "./audio.js";
import * as offline from "./offline.js";

/**
 * @param {Function} setStatus
 * @param {HTMLInputElement} statusInput
 * @param {Map} statuses
 * @param {Map} inboxUrls
 * @param {Function} loadIdsFromUrl
 * @param {Function} checkInboxParam
 * @param {Function} renderUsers
 * @param {Function} updateUrlWithIds
 * @param {Function} fetchOfflineMessages
 * @param {Function} closeSettingsModal
 */
export async function resetAllData({
  setStatus,
  statusInput,
  statuses,
  inboxUrls,
  loadIdsFromUrl,
  checkInboxParam,
  renderUsers,
  updateUrlWithIds,
  fetchOfflineMessages,
  closeSettingsModal,
}) {
  if (
    !confirm(
      "This action will delete all your data and restart the application. Do you want to continue?"
    )
  ) {
    return;
  }

  const currentId = store.get("peerId");
  const keepId = confirm("Do you want to keep your current ID?");

  for (const conn of peerMod.getConnections().values()) {
    if (conn) {
      conn.close();
    }
  }

  peerMod.destroyPeer();

  const keys = Object.keys(localStorage);
  for (const key of keys) {
    localStorage.removeItem(key);
  }

  if (keepId && currentId) {
    store.set("peerId", currentId);
  }

  statuses.clear();
  inboxUrls.clear();

  UI.uList.innerHTML = "<li>No users added.</li>";
  UI.msgs.innerHTML = "<li>No messages yet.</li>";
  UI.pid.value = "";
  UI.msg.value = "";
  statusInput.value = "";
  UI.inboxUrl.value = "";
  UI.camera.checked = false;
  UI.mic.checked = false;
  UI.screen.checked = false;
  UI.ai.checked = false;

  if (camera.isActive()) {
    camera.toggle();
  }
  if (audio.isActive()) {
    audio.toggle();
  }

  await peerMod.ensurePeer();
  const myId = store.get("peerId");
  UI.id.textContent = myId;
  setStatus(myId, "");

  loadIdsFromUrl();
  await checkInboxParam();

  renderUsers();

  updateUrlWithIds();

  await fetchOfflineMessages(myId);

  closeSettingsModal();

  alert("Data cleaned successfully. The application has been restarted.");
}
