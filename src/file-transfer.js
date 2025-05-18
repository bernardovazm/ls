import { UI } from "./ui.js";
import * as peerMod from "./peer.js";

const CHUNK_SIZE = 64 * 1024;

const incomingFiles = new Map();
const outgoingFiles = new Map();

export function init() {}

export function storeOutgoingFile(transferId, file, targetPeerId) {
  outgoingFiles.set(transferId, {
    file: file,
    peerId: targetPeerId,
    progress: 0,
    startTime: Date.now(),
    sentChunks: 0,
    totalChunks: Math.ceil(file.size / CHUNK_SIZE),
    canceled: false,
  });
  displayOutgoingFilePreview(transferId, file, targetPeerId);
}

export function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + " B";
  } else if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + " KB";
  } else if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  } else {
    return (bytes / (1024 * 1024 * 1024)).toFixed(1) + " GB";
  }
}

export function handleFileTransferRequest(from, data) {
  if (!data || !data.fileInfo) return;

  const { id, name, size, type } = data.fileInfo;

  incomingFiles.set(id, {
    id,
    name,
    size,
    type,
    from,
    progress: 0,
    receivedChunks: 0,
    totalChunks: Math.ceil(size / CHUNK_SIZE),
    chunks: [],
    completed: false,
  });

  addFileRequestToUserItem(from, id, name, size);
}

function addFileRequestToUserItem(peerId, transferId, fileName, fileSize) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.includes(peerId)
  );

  if (!userItem) return;

  const fileRequestContainer = document.createElement("div");
  fileRequestContainer.className = "file-request-container";
  fileRequestContainer.dataset.transferId = transferId;
  const fileExtension = fileName.split(".").pop().toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(
    fileExtension
  );
  const filePreview = isImage
    ? `<div class="file-preview">
      <div class="image-placeholder">
        <span>🖼️</span>
      </div>
    </div>`
    : "";
  fileRequestContainer.innerHTML = `
    <div class="file-info">
      <h4>File received:</h4>
      ${filePreview}
      <div class="file-details">
        <span class="file-name">${fileName}</span>
        <span class="file-size">(${formatFileSize(fileSize)})</span>
      </div>
      <div class="file-progress-container" hidden>
        <div class="progress-bar">
          <div class="progress" style="width: 0%"></div>
        </div>
      </div>
      <div class="file-actions">
        <button class="accept-file-btn secondary-btn">Accept</button>
        <button class="reject-file-btn secondary-btn">Reject</button>
      </div>
    </div>
  `;

  const acceptBtn = fileRequestContainer.querySelector(".accept-file-btn");
  const rejectBtn = fileRequestContainer.querySelector(".reject-file-btn");

  acceptBtn.addEventListener("click", () => {
    acceptIncomingFile(transferId);

    const progressContainer = fileRequestContainer.querySelector(
      ".file-progress-container"
    );
    progressContainer.removeAttribute("hidden");

    const actionsContainer =
      fileRequestContainer.querySelector(".file-actions");
    actionsContainer.setAttribute("hidden", "true");
  });

  rejectBtn.addEventListener("click", () => {
    rejectIncomingFile(transferId);

    userItem.removeChild(fileRequestContainer);
  });

  userItem.appendChild(fileRequestContainer);
}

function acceptIncomingFile(transferId) {
  const fileData = incomingFiles.get(transferId);
  if (!fileData) return;

  sendToPeer(fileData.from, {
    type: "FILE_TRANSFER_ACCEPTED",
    transferId,
  });
}

function rejectIncomingFile(transferId) {
  const fileData = incomingFiles.get(transferId);
  if (!fileData) return;

  sendToPeer(fileData.from, {
    type: "FILE_TRANSFER_REJECTED",
    transferId,
  });

  incomingFiles.delete(transferId);
}

export function handleFileTransferAccepted(from, data) {
  if (!data || !data.transferId) return;

  const transferId = data.transferId;
  const fileData = outgoingFiles.get(transferId);

  if (!fileData) return;

  sendNextChunk(transferId, from, 0);
}

export function handleFileTransferRejected(from, data) {
  if (!data || !data.transferId) return;

  const transferId = data.transferId;

  outgoingFiles.delete(transferId);

  alert(`The recipient rejected the file.`);
}

function sendNextChunk(transferId, targetPeerId, chunkIndex) {
  const fileData = outgoingFiles.get(transferId);
  if (!fileData || fileData.canceled) return;

  const file = fileData.file;
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);

  if (start >= file.size) {
    sendToPeer(targetPeerId, {
      type: "FILE_TRANSFER_COMPLETE",
      transferId,
    });

    setTimeout(() => {
      outgoingFiles.delete(transferId);
    }, 2000);

    return;
  }

  const reader = new FileReader();
  const blob = file.slice(start, end);

  reader.onload = function (e) {
    const chunk = e.target.result;

    sendToPeer(targetPeerId, {
      type: "FILE_CHUNK",
      transferId,
      chunkIndex,
      chunk,
    });

    fileData.sentChunks++;
    fileData.progress = (fileData.sentChunks / fileData.totalChunks) * 100;

    setTimeout(() => {
      sendNextChunk(transferId, targetPeerId, chunkIndex + 1);
    }, 10);
  };

  reader.readAsArrayBuffer(blob);
}

export function handleFileChunk(from, data) {
  if (!data || !data.transferId || !data.chunk) return;

  const { transferId, chunkIndex, chunk } = data;
  const fileData = incomingFiles.get(transferId);

  if (!fileData) return;

  fileData.chunks[chunkIndex] = new Uint8Array(chunk);
  fileData.receivedChunks++;

  fileData.progress = (fileData.receivedChunks / fileData.totalChunks) * 100;

  updateFileTransferProgress(from, transferId, fileData.progress);
}

function updateFileTransferProgress(peerId, transferId, progress) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.includes(peerId)
  );

  if (!userItem) return;

  const fileRequestContainer = userItem.querySelector(
    `.file-request-container[data-transfer-id="${transferId}"]`
  );
  if (!fileRequestContainer) return;

  const progressBar = fileRequestContainer.querySelector(".progress");
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }
}

export function handleFileTransferComplete(from, data) {
  if (!data || !data.transferId) return;

  const transferId = data.transferId;
  const fileData = incomingFiles.get(transferId);

  if (!fileData) return;

  fileData.completed = true;

  const fileBlob = combineChunks(fileData);
  const downloadUrl = URL.createObjectURL(fileBlob);
  const fileExtension = fileData.name.split(".").pop().toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(
    fileExtension
  );
  if (isImage) {
    updateImagePreview(from, transferId, downloadUrl);
  }
  displayFileDownloadMessage(fileData.name, downloadUrl, fileData.size, from);

  setTimeout(() => {
    const userItem = [...UI.uList.children].find(
      (el) => el.dataset.peerId === from || el.textContent.includes(from)
    );

    if (!userItem) return;

    const fileRequestContainer = userItem.querySelector(
      `.file-request-container[data-transfer-id="${transferId}"]`
    );
    if (fileRequestContainer) {
      userItem.removeChild(fileRequestContainer);
    }
  }, 2000);
}
function updateImagePreview(peerId, transferId, imageUrl) {
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.includes(peerId)
  );
  if (!userItem) return;
  const fileRequestContainer = userItem.querySelector(
    `.file-request-container[data-transfer-id="${transferId}"]`
  );
  if (!fileRequestContainer) return;
  const previewContainer = fileRequestContainer.querySelector(".file-preview");
  if (previewContainer) {
    previewContainer.innerHTML = `<img src="${imageUrl}" alt="Preview" class="image-preview">`;
  }
}

function combineChunks(fileData) {
  let totalLength = 0;
  fileData.chunks.forEach((chunk) => {
    if (chunk) totalLength += chunk.length;
  });

  const combined = new Uint8Array(totalLength);
  let offset = 0;

  fileData.chunks.forEach((chunk) => {
    if (chunk) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
  });

  return new Blob([combined], {
    type: fileData.type || "application/octet-stream",
  });
}

function displayFileDownloadMessage(fileName, url, fileSize, from) {
  const fileExtension = fileName.split(".").pop().toLowerCase();
  let fileIcon = "📄";

  const iconMap = {
    pdf: "📕",
    doc: "📘",
    docx: "📘",
    xls: "📗",
    xlsx: "📗",
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    mp3: "🎵",
    wav: "🎵",
    mp4: "🎬",
    avi: "🎬",
    mov: "🎬",
    zip: "🗜️",
    rar: "🗜️",
  };

  if (iconMap[fileExtension]) {
    fileIcon = iconMap[fileExtension];
  }
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(
    fileExtension
  );
  let imagePreview = "";

  if (isImage) {
    imagePreview = `<div class="chat-image-preview"><img src="${url}" alt="Preview" class="chat-image"></div>`;
  }
  const fileMessage = `
    <div class="file-message">
      <span class="file-icon">${fileIcon}</span>
      <a href="${url}" class="file-download-link" download="${fileName}">${fileName}</a>
      <span class="file-size">(${formatFileSize(fileSize)})</span>
      ${imagePreview}
    </div>
  `;

  const t = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  UI.msgs.insertAdjacentHTML(
    "afterbegin",
    `<li><small>[${t}]</small> <strong>${from}:</strong> ${fileMessage}</li>`
  );
}

function sendToPeer(peerId, data) {
  const conn = peerMod.getConnections().get(peerId);
  if (conn?.open) {
    conn.send(data);
    return true;
  }
  return false;
}

function displayOutgoingFilePreview(transferId, file, targetPeerId) {
  const fileExtension = file.name.split(".").pop().toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(
    fileExtension
  );

  const imageUrl = isImage ? URL.createObjectURL(file) : "";

  let fileIcon = "📄";
  const iconMap = {
    pdf: "📕",
    doc: "📘",
    docx: "📘",
    xls: "📗",
    xlsx: "📗",
    jpg: "🖼️",
    jpeg: "🖼️",
    png: "🖼️",
    gif: "🖼️",
    mp3: "🎵",
    wav: "🎵",
    mp4: "🎬",
    avi: "🎬",
    mov: "🎬",
    zip: "🗜️",
    rar: "🗜️",
  };

  if (iconMap[fileExtension]) {
    fileIcon = iconMap[fileExtension];
  }

  const userItem = [...UI.uList.children].find(
    (el) =>
      el.dataset.peerId === targetPeerId ||
      el.textContent.includes(targetPeerId)
  );

  if (!userItem) return;

  const previewContainer = document.createElement("div");
  previewContainer.className = "outgoing-file-container";
  previewContainer.dataset.transferId = transferId;

  const previewContent = isImage
    ? `<div class="file-preview">
      <img src="${imageUrl}" alt="Preview" class="image-preview">
    </div>`
    : `<div class="file-icon-preview">
      <span class="large-file-icon">${fileIcon}</span>
    </div>`;

  previewContainer.innerHTML = `
    <div class="file-info">
      <h4>Sending file:</h4>
      ${previewContent}
      <div class="file-details">
        <span class="file-name">${file.name}</span>
        <span class="file-size">(${formatFileSize(file.size)})</span>
      </div>
      <div class="file-progress-container">
        <div class="progress-bar">
          <div class="progress" style="width: 0%"></div>
        </div>
      </div>
    </div>
  `;

  userItem.appendChild(previewContainer);

  const fileData = outgoingFiles.get(transferId);

  if (fileData) {
    const updateProgress = setInterval(() => {
      if (!outgoingFiles.has(transferId)) {
        clearInterval(updateProgress);

        setTimeout(() => {
          if (previewContainer.parentNode) {
            previewContainer.parentNode.removeChild(previewContainer);
          }
        }, 2000);

        return;
      }

      const progress = fileData.progress;
      const progressBar = previewContainer.querySelector(".progress");

      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
    }, 100);
  }
}
