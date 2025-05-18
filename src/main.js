import { UI } from "./ui.js";
import { store } from "./storage.js";
import * as peerMod from "./peer.js";
import * as ai from "./ai.js";
import * as tr from "./translation.js";
import * as audio from "./audio.js";
import * as camera from "./camera.js";
import * as screen from "./screen.js";
import * as fileTransfer from "./file-transfer.js";
import * as offline from "./offline.js";

const statuses = new Map();
const statusInput = document.querySelector("#statusInput");
const inboxUrls = new Map();

(async () => {
  await peerMod.ensurePeer();
  const myId = store.get("peerId");
  UI.id.textContent = myId;
  statusInput.value = store.get("myStatus", "");
  setStatus(myId, statusInput.value);

  loadSaved();
  loadIdsFromUrl();
  await checkInboxParam();
  renderUsers();
  bindEvents(myId);
  tr.startCountdown();
  broadcastStatus(myId);
  setInterval(reconnectLoop, 5_000);
  setInterval(() => broadcastStatus(myId), 10_000);
  updateUrlWithIds();
  await fetchOfflineMessages(myId);
})();

/* ---------- URL ID helpers ---------- */
function loadIdsFromUrl() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const idsParam = urlParams.get("ids");

    if (idsParam) {
      const ids = idsParam
        .split(",")
        .map((id) => id.trim())
        .filter((id) => id);
      const myId = store.get("peerId");
      const userList = users();
      let updated = false;

      for (const id of ids) {
        if (id !== myId && !userList.includes(id)) {
          userList.push(id);
          updated = true;

          peerMod.connect(id);
        }
      }

      if (updated) {
        save(userList);
      }
    }
  } catch (error) {
    console.error("Error loading IDs from URL:", error);
  }
}

async function checkInboxParam() {
  const inboxUrl = offline.checkInboxFromUrl();
  if (inboxUrl) {
    offline.saveInboxUrl(inboxUrl);
    UI.inboxUrl.value = inboxUrl;
  } else {
    UI.inboxUrl.value = offline.getInboxUrl();
    const storedInboxUrl = offline.getInboxUrl();
    if (storedInboxUrl) {
      const url = new URL(window.location);
      url.searchParams.set("inbox", storedInboxUrl);
      window.history.replaceState({}, "", url);
    }
  }
  const inboxUrlToUse = inboxUrl || offline.getInboxUrl();
  if (inboxUrlToUse) {
    const myId = store.get("peerId");
    try {
      await offline.registerPeerIdWithInbox(inboxUrlToUse, myId);
      console.log("ID registered in inbox during initialization");
    } catch (error) {
      console.error(
        "Error registering ID in inbox during initialization:",
        error
      );
    }
  }
}

function updateUrlWithIds() {
  try {
    const userList = users();
    const myId = store.get("peerId");
    if (
      userList.length === 0 &&
      !window.location.search.includes("ids=") &&
      !window.location.search.includes("inbox=")
    ) {
      return;
    }
    const allIds = [myId, ...userList.filter((id) => id !== myId)];
    const idsString = allIds.join(",");
    const url = new URL(window.location);
    const inboxUrl = url.searchParams.get("inbox") || offline.getInboxUrl();
    url.searchParams.set("ids", idsString);
    if (inboxUrl) {
      url.searchParams.set("inbox", inboxUrl);
    }
    window.history.replaceState({}, "", url);
  } catch (error) {
    console.error("Error updating URL with IDs:", error);
  }
}

/* ---------- status helpers ---------- */
function setStatus(id, text) {
  statuses.set(id, text);
  const li = [...UI.uList.children].find(
    (el) => el.dataset.peerId === id || el.textContent.startsWith(id)
  );
  if (li) {
    let span = li.querySelector(".note");
    if (!span) {
      span = document.createElement("span");
      span.className = "note";
      li.appendChild(span);
    }
    span.textContent = text;
  }
}
function broadcastStatus(myId) {
  const txt = statusInput.value.trim();
  setStatus(myId, txt);
  store.set("myStatus", txt);
  for (const c of peerMod.getConnections().values())
    if (c.open) c.send(`STATUS:${txt}`);
}
function sendStatusTo(peerId) {
  const c = peerMod.getConnections().get(peerId);
  if (c?.open) c.send(`STATUS:${statusInput.value.trim()}`);
}

/* ---------- user list helpers ---------- */
function users() {
  return store.get("userList", []);
}
function save(u) {
  store.set("userList", u);
  updateUrlWithIds();
}
function renderUsers() {
  const list = users();
  const connections = peerMod.getConnections();

  if (!list.length) {
    UI.uList.innerHTML = "<li>No users added.</li>";
    return;
  }
  if (
    UI.uList.children.length > 0 &&
    UI.uList.children[0].textContent !== "No users added."
  ) {
    const existingIds = new Set();
    [...UI.uList.children].forEach((li) => {
      const id = li.dataset.peerId || li.textContent.split(" ")[0];
      existingIds.add(id);
      if (list.includes(id)) {
        const statusDot = li.querySelector(".status");
        const noteSpan = li.querySelector(".note");
        const isConnected = connections.get(id)?.open;
        if (statusDot) {
          statusDot.textContent = isConnected ? " ● " : " ○ ";
        }
        const currentStatus = statuses.get(id) ?? "";
        if (noteSpan && noteSpan.textContent !== currentStatus) {
          noteSpan.textContent = currentStatus;
        }
      } else {
        UI.uList.removeChild(li);
      }
    });

    list.forEach((id) => {
      if (!existingIds.has(id)) {
        const isConnected = connections.get(id)?.open;
        const status = statuses.get(id) ?? "";

        const li = document.createElement("li");
        li.dataset.peerId = id;
        const removeBtn = document.createElement("span");
        removeBtn.className = "remove-user";
        removeBtn.textContent = "×";
        removeBtn.title = "Remove user";
        removeBtn.onclick = (e) => {
          e.stopPropagation();
          removeUser(id);
        };
        li.innerHTML = `<span class="status"> ${
          isConnected ? "●" : "○"
        } </span> ${id} <span class="note">${status}</span>`;
        li.appendChild(removeBtn);
        UI.uList.appendChild(li);
      }
    });
  } else {
    UI.uList.innerHTML = list
      .map((id) => {
        const on = connections.get(id)?.open;
        const note = statuses.get(id) ?? "";
        return `<li data-peer-id="${id}"><span class="status"> ${
          on ? "●" : "○"
        } </span> ${id} <span class="note"> ${note}</span><span class="remove-user" title="Remove user" onclick="(function(e) { e.stopPropagation(); window.removeUser('${id}'); })(event)">×</span></li>`;
      })
      .join("");
    window.removeUser = removeUser;
  }
}
function removeUser(id) {
  if (!id) return;
  if (!confirm(`Remove user ${id} from list?`)) return;
  try {
    const userList = users();
    const index = userList.indexOf(id);
    if (index !== -1) {
      userList.splice(index, 1);
      const conn = peerMod.getConnections().get(id);
      if (conn) {
        conn.close();
      }
      save(userList);
      renderUsers();
    }
  } catch (error) {
    console.error("Error removing user:", error);
  }
}
function updateConnDot(id, on) {
  const li = [...UI.uList.children].find(
    (el) => el.dataset.peerId === id || el.textContent.startsWith(id)
  );
  if (li) li.querySelector(".status").textContent = on ? " ● " : " ○ ";
  if (on) sendStatusTo(id);
  if (!on) {
    audio.handleAudioFlag(id, false);
    camera.removeRemoteVideo(id);
    screen.removeRemoteScreen(id);
  }
}

/* ---------- event wiring ---------- */
function bindEvents(myId) {
  UI.sendBtn.addEventListener("click", onSend);
  UI.msg.addEventListener("keypress", (e) => e.key === "Enter" && onSend());
  UI.addBtn.addEventListener("click", addUser);
  UI.shareBtn?.addEventListener("click", shareLink);
  UI.settingsBtn?.addEventListener("click", openSettingsModal);
  UI.saveSettingsBtn?.addEventListener("click", saveSettings);
  UI.closeModal?.addEventListener("click", closeSettingsModal);
  UI.testInboxBtn?.addEventListener("click", testInboxConnection);
  UI.mic.addEventListener("change", audio.toggle);
  statusInput.addEventListener("input", () => broadcastStatus(myId));

  window.addEventListener("click", (e) => {
    if (e.target === UI.settingsModal) {
      closeSettingsModal();
    }
  });
  makeIdEditable();
  camera.init();
  screen.init();
  fileTransfer.init();

  peerMod.on("message", ({ from, data }) => {
    if (typeof data === "object" && data !== null && data.type) {
      handleObjectMessage(from, data);
      return;
    }

    if (data === "AUDIO_ON") {
      audio.handleAudioFlag(from, true);
      return;
    }
    if (data === "AUDIO_OFF") {
      audio.handleAudioFlag(from, false);
      return;
    }
    if (data === "VIDEO_ON") {
      camera.handleVideoStatus(from, true);
      return;
    }
    if (data === "VIDEO_OFF") {
      camera.handleVideoStatus(from, false);
      return;
    }
    if (data === "SCREEN_ON") {
      screen.handleScreenStatus(from, true);
      return;
    }
    if (data === "SCREEN_OFF") {
      screen.handleScreenStatus(from, false);
      return;
    }
    if (typeof data === "string" && data.startsWith("STATUS:")) {
      setStatus(from, data.slice(7));
      return;
    }
    if (typeof data === "string" && data.startsWith("ID_CHANGED:")) {
      const parts = data.split(":");
      if (parts.length === 3) {
        const oldId = parts[1];
        const newId = parts[2];
        handlePeerIdChange(oldId, newId);
      }
      return;
    }
    if (typeof data === "string" && data.startsWith("INBOX_URL:")) {
      const inboxUrl = data.slice(10);
      if (inboxUrl) {
        inboxUrls.set(from, inboxUrl);
      }
      return;
    }
    show(from, data);
  });

  peerMod.on("videocall", ({ call, from }) => {
    camera.handleVideoCall(call, from);
  });

  peerMod.on("screencall", ({ call, from }) => {
    screen.handleScreenCall(call, from);
  });

  peerMod.on("opened", ({ conn }) => {
    sendStatusTo(conn.peer);
    sendInboxUrl(conn.peer);
    if (UI.camera.checked) {
      camera.shareVideoWithPeer(conn.peer);
    }
    if (UI.screen.checked) {
      screen.shareScreenWithPeer(conn.peer);
    }
  });

  peerMod.on("status", ({ id, online }) => updateConnDot(id, online));
}

function openSettingsModal() {
  UI.inboxUrl.value = offline.getInboxUrl();
  UI.settingsModal.style.display = "block";
}
function closeSettingsModal() {
  UI.settingsModal.style.display = "none";
}

async function saveSettings() {
  const inboxUrl = UI.inboxUrl.value.trim();
  const previousUrl = offline.getInboxUrl();
  const myId = store.get("peerId");
  if (inboxUrl !== previousUrl) {
    offline.saveInboxUrl(inboxUrl);
    console.log("New inbox URL saved:", inboxUrl);
    const url = new URL(window.location);
    if (inboxUrl) {
      url.searchParams.set("inbox", inboxUrl);
    } else {
      url.searchParams.delete("inbox");
    }
    window.history.replaceState({}, "", url);
    updateUrlWithIds();
    if (inboxUrl) {
      try {
        console.log("Registering ID in new inbox:", myId);
        const peers = await offline.registerPeerIdWithInbox(inboxUrl, myId);
        console.log("Other users in the same inbox:", peers);
        connectToInboxPeers(peers, myId);
      } catch (error) {
        console.error("Error registering ID in inbox:", error);
        alert(
          `Warning: The URL was saved, but there was an error registering your ID: ${error.message}`
        );
      }
    }
  }
  broadcastInboxUrl();
  closeSettingsModal();
  alert("Settings saved successfully!");
}
function sendInboxUrl(peerId) {
  const inboxUrl = offline.getInboxUrl();
  if (inboxUrl) {
    const conn = peerMod.getConnections().get(peerId);
    if (conn?.open) {
      conn.send(`INBOX_URL:${inboxUrl}`);
    }
  }
}
function broadcastInboxUrl() {
  const inboxUrl = offline.getInboxUrl();
  if (inboxUrl) {
    for (const c of peerMod.getConnections().values()) {
      if (c.open) {
        c.send(`INBOX_URL:${inboxUrl}`);
      }
    }
  }
}
async function fetchOfflineMessages(myId) {
  const inboxUrl = offline.getInboxUrl();
  if (!inboxUrl) return;

  try {
    const messages = await offline.fetchOfflineMessages(inboxUrl, myId);
    console.log(
      `Received ${
        messages?.length || 0
      } offline messages from inbox (filtered by recipient: ${myId})`
    );
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        if (msg.from && msg.message && msg.timestamp && msg.to === myId) {
          const time = new Date(msg.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });
          console.log(
            `Displaying offline message from ${msg.from} (time: ${time})`
          );
          await show(msg.from, msg.message, false, true);
        } else {
          console.warn(
            `Ignoring message that does not meet the criteria: from=${
              msg.from
            }, to=${
              msg.to
            }, message present=${!!msg.message}, timestamp present=${!!msg.timestamp}`
          );
        }
      }
    }
  } catch (error) {
    console.error("Error fetching offline messages:", error);
  }
}

function addUser() {
  const id = UI.pid.value.trim();
  if (!id || id === store.get("peerId")) return;
  const list = users();
  if (!list.includes(id)) {
    list.push(id);
    save(list);
    renderUsers();
    peerMod.connect(id);
    const inboxUrl = offline.getInboxUrl();
    if (inboxUrl) {
      registerIdInInbox(id, inboxUrl);
    }
  }
  UI.pid.value = "";
}

async function registerIdInInbox(id, inboxUrl) {
  try {
    const baseUrl = new URL(inboxUrl);
    baseUrl.search = "";

    const response = await fetch(baseUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      console.warn(`Error fetching inbox data: ${response.status}`);
      return;
    }
    const peers = [];
    const messages = [];
    try {
      const data = await response.json();
      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (typeof item === "string") {
            peers.push(item);
          } else if (item && typeof item === "object") {
            if (item.to && item.from && item.message) {
              messages.push(item);
            }
          }
        });
      } else if (data && typeof data === "object") {
        if (Array.isArray(data.peers)) {
          data.peers.forEach((peerId) => {
            if (typeof peerId === "string") {
              peers.push(peerId);
            }
          });
        }

        if (Array.isArray(data.messages)) {
          messages.push(...data.messages);
        }
      }
    } catch (e) {
      console.error("Error processing inbox data:", e);
      return;
    }
    if (!peers.includes(id)) {
      peers.push(id);
      console.log(`ID ${id} added to inbox`);
    } else {
      console.log(`ID ${id} already exists in inbox`);
      return;
    }
    const updatedData = [...peers, ...messages];
    const putResponse = await fetch(baseUrl.toString(), {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updatedData),
    });

    if (!putResponse.ok) {
      console.warn(`Error updating inbox: ${putResponse.status}`);
    } else {
      console.log(`ID ${id} registered in inbox`);
    }
  } catch (error) {
    console.error("Error registering ID in inbox:", error);
  }
}
/* ---------- messaging ---------- */
async function onSend() {
  const txt = UI.msg.value.trim();
  const fileInput = UI.selectFileBtn;

  if (fileInput.files && fileInput.files.length > 0) {
    sendFile(fileInput.files[0]);
    fileInput.value = "";
    return;
  }

  if (!txt) return;
  const connectedPeers = [...peerMod.getConnections().entries()]
    .filter(([_, conn]) => conn.open)
    .map(([id, _]) => id);
  let messageSent = false;
  if (connectedPeers.length > 0) {
    for (const c of peerMod.getConnections().values()) {
      if (c.open) {
        c.send(txt);
        messageSent = true;
      }
    }
  }

  const sentOffline = await tryOfflineMessages(txt);
  messageSent = messageSent || sentOffline;
  if (!messageSent && users().length > 0) {
    alert(
      "It was not possible to send messages. There are no connected users or inbox URLs configured."
    );
  }
  const out = UI.ai.checked ? await ai.answer(txt) : txt;
  await show("You", out);
  UI.msg.value = "";
}

async function tryOfflineMessages(txt) {
  const myId = store.get("peerId");
  const userList = users();
  let sentToSomeone = false;
  const defaultInboxUrl = offline.getInboxUrl();
  for (const userId of userList) {
    const isConnected = peerMod.getConnections().get(userId)?.open;
    if (isConnected) continue;
    const userInboxUrl = inboxUrls.get(userId) || defaultInboxUrl;
    if (userInboxUrl) {
      console.log(`Sending offline message to ${userId} via ${userInboxUrl}`);
      const success = await offline.sendOfflineMessage(
        userId,
        myId,
        userInboxUrl,
        txt
      );
      if (success) {
        sentToSomeone = true;
        await show(`You → ${userId} (offline)`, txt);
      }
    }
  }
  if (userList.length > 0 && !sentToSomeone) {
    alert(
      "It was not possible to send offline messages. Check if the inbox URLs are configured correctly."
    );
  }
  return sentToSomeone;
}

function sendFile(file) {
  const activeConnections = [...peerMod.getConnections().entries()].filter(
    ([_, conn]) => conn.open
  );

  if (activeConnections.length === 0) {
    alert("There are no connected users to send the file.");
    return;
  }

  let targetPeerId;

  if (activeConnections.length === 1) {
    targetPeerId = activeConnections[0][0];
  } else {
    const userList = activeConnections.map(([id, _]) => id);
    const selectedIndex = prompt(
      `Select the recipient (1-${userList.length}):\n` +
        userList.map((id, index) => `${index + 1}. ${id}`).join("\n")
    );

    if (selectedIndex === null) return;

    const index = parseInt(selectedIndex) - 1;
    if (isNaN(index) || index < 0 || index >= userList.length) {
      alert("Invalid selection.");
      return;
    }

    targetPeerId = userList[index];
  }

  const transferId = generateTransferId();

  const fileInfo = {
    id: transferId,
    name: file.name,
    type: file.type,
    size: file.size,
  };
  fileTransfer.storeOutgoingFile(transferId, file, targetPeerId);
  sendToPeer(targetPeerId, {
    type: "FILE_TRANSFER_REQUEST",
    fileInfo,
  });
  alert(`File transfer request sent to ${targetPeerId}`);
}

function generateTransferId() {
  return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function sendToPeer(peerId, data) {
  const conn = peerMod.getConnections().get(peerId);
  if (conn?.open) {
    conn.send(data);
    return true;
  }
  return false;
}

async function show(sender, txt, skip = false, isOffline = false) {
  txt = await tr.translateIfEnabled(txt);
  if (UI.msgs.firstElementChild?.textContent.startsWith("No"))
    UI.msgs.innerHTML = "";
  const t = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const offlineIcon = isOffline ? "📬 " : "";
  UI.msgs.insertAdjacentHTML(
    "afterbegin",
    `<li><small>[${t}]</small> <strong>${offlineIcon}${sender}:</strong> <span>${txt}</span></li>`
  );
  if (!skip) saveMsg({ sender, text: txt, time: Date.now(), isOffline });
}

/* ---------- persistence ---------- */
function saveMsg(m) {
  const arr = store.get("messages", []);
  arr.push(m);
  store.set("messages", arr);
}
function loadSaved() {
  for (const m of store.get("messages", [])) {
    show(m.sender, m.text, true, m.isOffline);
  }
}

/* ---------- reconnect loop ---------- */
function reconnectLoop() {
  for (const id of users())
    if (!peerMod.getConnections().get(id)?.open) peerMod.connect(id);
  renderUsers();
  camera.recoverVideos();
  screen.recoverScreens();

  if (UI.camera.checked) {
    for (const [peerId, conn] of peerMod.getConnections().entries()) {
      if (conn.open && !camera.isSharing(peerId)) {
        camera.shareVideoWithPeer(peerId);
      }
    }
  }

  if (UI.screen.checked) {
    for (const [peerId, conn] of peerMod.getConnections().entries()) {
      if (conn.open && !screen.isSharing(peerId)) {
        screen.shareScreenWithPeer(peerId);
      }
    }
  }
}

function makeIdEditable() {
  const idElement = UI.id;
  idElement.addEventListener("focus", () => {
    const currentId = store.get("peerId", "");
    idElement.dataset.originalText = idElement.textContent;
    idElement.setAttribute("contenteditable", "true");
    idElement.textContent = currentId;
    idElement.classList.add("editing");
    const range = document.createRange();
    range.selectNodeContents(idElement);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  idElement.addEventListener("blur", async () => {
    const currentId = store.get("peerId", "");
    const newId = idElement.textContent.trim();
    idElement.removeAttribute("contenteditable");
    idElement.classList.remove("editing");
    if (newId !== currentId && newId.length >= 1) {
      const loadingIndicator = document.createElement("span");
      loadingIndicator.className = "loading-indicator";
      idElement.textContent = idElement.dataset.originalText || currentId;
      idElement.appendChild(loadingIndicator);
      try {
        const result = await peerMod.changeId(newId);

        if (result.success) {
          idElement.textContent = newId;
          updateUrlWithIds();
        } else {
          idElement.textContent = currentId;
          alert(`Error changing ID: ${result.error}`);
        }
      } catch (error) {
        console.error("Error changing ID:", error);
        idElement.textContent = currentId;
        alert("Error changing ID.");
      } finally {
        if (idElement.querySelector(".loading-indicator")) {
          idElement.removeChild(idElement.querySelector(".loading-indicator"));
        }
      }
    } else if (newId.length < 1 && newId !== currentId) {
      idElement.textContent = idElement.dataset.originalText || currentId;
    }
  });

  idElement.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      idElement.blur();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      idElement.textContent =
        idElement.dataset.originalText || store.get("peerId", "");
      idElement.removeAttribute("contenteditable");
      idElement.classList.remove("editing");
      e.stopPropagation();
    }
  });
}

function handlePeerIdChange(oldId, newId) {
  console.log(`Peer ID changed: ${oldId} -> ${newId}`);
  const updated = peerMod.updatePeerIdInUserList(oldId, newId);
  if (updated) {
    renderUsers();
    updateUrlWithIds();
    const oldStatus = statuses.get(oldId);
    if (oldStatus) {
      statuses.delete(oldId);
      setStatus(newId, oldStatus);
    }
    if (inboxUrls.has(oldId)) {
      inboxUrls.set(newId, inboxUrls.get(oldId));
      inboxUrls.delete(oldId);
    }
  }
}

function handleObjectMessage(from, data) {
  switch (data.type) {
    case "FILE_TRANSFER_REQUEST":
      fileTransfer.handleFileTransferRequest(from, data);
      break;

    case "FILE_TRANSFER_ACCEPTED":
      fileTransfer.handleFileTransferAccepted(from, data);
      break;

    case "FILE_TRANSFER_REJECTED":
      fileTransfer.handleFileTransferRejected(from, data);
      break;

    case "FILE_CHUNK":
      fileTransfer.handleFileChunk(from, data);
      break;

    case "FILE_TRANSFER_COMPLETE":
      fileTransfer.handleFileTransferComplete(from, data);
      break;

    default:
      console.log("Unknown message received:", data);
  }
}

function shareLink() {
  const url = new URL(window.location.href);
  const peerId = UI.id.textContent;
  url.search = "";
  url.searchParams.set("ids", peerId);
  const inboxUrl = offline.getInboxUrl();
  if (inboxUrl) {
    url.searchParams.set("inbox", inboxUrl);
  }
  const shareUrl = url.toString();
  if (navigator.share) {
    navigator
      .share({
        title: "LS - Share link",
        text: "Contact me using this link:",
        url: shareUrl,
      })
      .catch((err) => {
        console.error("Error sharing:", err);
        fallbackShare(shareUrl);
      });
  } else {
    fallbackShare(shareUrl);
  }
}

function fallbackShare(url) {
  try {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        alert("Link copied to clipboard!");
      })
      .catch((err) => {
        console.error("Error copying:", err);
        promptManualCopy(url);
      });
  } catch (err) {
    promptManualCopy(url);
  }
}

function promptManualCopy(url) {
  const textarea = document.createElement("textarea");
  textarea.value = url;
  document.body.appendChild(textarea);
  textarea.select();

  try {
    document.execCommand("copy");
    alert("Link copied to clipboard!");
  } catch (err) {
    alert(`Copy this link manually: ${url}`);
  }

  document.body.removeChild(textarea);
}

async function testInboxConnection() {
  const inboxUrl = UI.inboxUrl.value.trim();
  if (!inboxUrl) {
    alert("Please enter a valid inbox URL to test.");
    return;
  }
  const testButton = UI.testInboxBtn;
  const originalText = testButton.textContent;
  testButton.textContent = "Testing...";
  testButton.disabled = true;
  try {
    const result = await offline.testInboxConnection(inboxUrl);
    if (result.success) {
      alert(
        `✅ Successfully connected!\n\nThe inbox is working correctly and you have access to ${
          result.details.write ? "read and write" : "read only"
        }.`
      );
    } else {
      alert(
        `❌ Error connecting to inbox: ${result.error}\n\n${
          result.details || ""
        }`
      );
    }
  } catch (error) {
    console.error("Error testing inbox connection:", error);
    alert(`❌ Error testing connection: ${error.message}`);
  } finally {
    testButton.textContent = originalText;
    testButton.disabled = false;
  }
}

/**
 * @param {Array} peers
 * @param {string} myId
 */
function connectToInboxPeers(peers, myId) {
  if (!Array.isArray(peers) || peers.length === 0) return;
  const userList = users();
  let updated = false;
  for (const id of peers) {
    if (id !== myId && !userList.includes(id)) {
      userList.push(id);
      updated = true;
      peerMod.connect(id);
      console.log(`Trying to connect to inbox peer: ${id}`);
    }
  }
  if (updated) {
    save(userList);
  }
}
