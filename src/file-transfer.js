import { UI } from "./ui.js";
import * as peerMod from "./peer.js";

const CHUNK_SIZE = 64 * 1024;

const incomingFiles = new Map();
const outgoingFiles = new Map();

export function init() {
  // Não precisamos mais dos event listeners para seleção e envio de arquivos
  // pois agora usamos o botão de envio de mensagens
  // Mantemos apenas os event listeners para aceitar/rejeitar arquivos
  // que serão adicionados dinamicamente aos itens da lista de usuários
}

// Função para armazenar arquivo para envio (exportada para uso em main.js)
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
}

// Função para formatar tamanho do arquivo
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

// Processar solicitação de transferência recebida
export function handleFileTransferRequest(from, data) {
  if (!data || !data.fileInfo) return;

  const { id, name, size, type } = data.fileInfo;

  // Armazenar informações do arquivo
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

  // Adicionar interface de aceitação/rejeição na lista de usuários
  addFileRequestToUserItem(from, id, name, size);
}

// Adicionar interface de solicitação de arquivo ao item do usuário na lista
function addFileRequestToUserItem(peerId, transferId, fileName, fileSize) {
  // Encontrar o item do usuário na lista
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.includes(peerId)
  );

  if (!userItem) return;

  // Criar contêiner para a solicitação de arquivo
  const fileRequestContainer = document.createElement("div");
  fileRequestContainer.className = "file-request-container";
  fileRequestContainer.dataset.transferId = transferId;

  // Criar conteúdo do contêiner
  fileRequestContainer.innerHTML = `
    <div class="file-info">
      <h4>Arquivo recebido:</h4>
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
        <button class="accept-file-btn secondary-btn">Aceitar</button>
        <button class="reject-file-btn secondary-btn">Rejeitar</button>
      </div>
    </div>
  `;

  // Adicionar event listeners aos botões
  const acceptBtn = fileRequestContainer.querySelector(".accept-file-btn");
  const rejectBtn = fileRequestContainer.querySelector(".reject-file-btn");

  acceptBtn.addEventListener("click", () => {
    acceptIncomingFile(transferId);

    // Mostrar barra de progresso
    const progressContainer = fileRequestContainer.querySelector(
      ".file-progress-container"
    );
    progressContainer.removeAttribute("hidden");

    // Esconder botões de ação
    const actionsContainer =
      fileRequestContainer.querySelector(".file-actions");
    actionsContainer.setAttribute("hidden", "true");
  });

  rejectBtn.addEventListener("click", () => {
    rejectIncomingFile(transferId);

    // Remover contêiner da solicitação
    userItem.removeChild(fileRequestContainer);
  });

  // Adicionar contêiner ao item do usuário
  userItem.appendChild(fileRequestContainer);
}

// Aceitar arquivo recebido
function acceptIncomingFile(transferId) {
  const fileData = incomingFiles.get(transferId);
  if (!fileData) return;

  // Enviar aceitação para o remetente
  sendToPeer(fileData.from, {
    type: "FILE_TRANSFER_ACCEPTED",
    transferId,
  });
}

// Rejeitar arquivo recebido
function rejectIncomingFile(transferId) {
  const fileData = incomingFiles.get(transferId);
  if (!fileData) return;

  // Enviar rejeição para o remetente
  sendToPeer(fileData.from, {
    type: "FILE_TRANSFER_REJECTED",
    transferId,
  });

  // Remover arquivo da lista
  incomingFiles.delete(transferId);
}

// Processar aceitação de transferência de arquivo
export function handleFileTransferAccepted(from, data) {
  if (!data || !data.transferId) return;

  const transferId = data.transferId;
  const fileData = outgoingFiles.get(transferId);

  if (!fileData) return;

  // Iniciar envio de chunks
  sendNextChunk(transferId, from, 0);
}

// Processar rejeição de transferência de arquivo
export function handleFileTransferRejected(from, data) {
  if (!data || !data.transferId) return;

  const transferId = data.transferId;

  // Remover arquivo da lista de transferências
  outgoingFiles.delete(transferId);

  // Notificar o usuário
  alert(`O destinatário rejeitou o arquivo.`);
}

// Enviar próximo chunk de dados
function sendNextChunk(transferId, targetPeerId, chunkIndex) {
  const fileData = outgoingFiles.get(transferId);
  if (!fileData || fileData.canceled) return;

  const file = fileData.file;
  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, file.size);

  // Verificar se já enviamos todos os chunks
  if (start >= file.size) {
    // Envio completo, notificar conclusão
    sendToPeer(targetPeerId, {
      type: "FILE_TRANSFER_COMPLETE",
      transferId,
    });

    // Remover após um breve intervalo
    setTimeout(() => {
      outgoingFiles.delete(transferId);
    }, 2000);

    return;
  }

  // Ler o próximo chunk do arquivo
  const reader = new FileReader();
  const blob = file.slice(start, end);

  reader.onload = function (e) {
    // Converter para ArrayBuffer e enviar
    const chunk = e.target.result;

    sendToPeer(targetPeerId, {
      type: "FILE_CHUNK",
      transferId,
      chunkIndex,
      chunk,
    });

    // Atualizar progresso
    fileData.sentChunks++;
    fileData.progress = (fileData.sentChunks / fileData.totalChunks) * 100;

    // Enviar próximo chunk após um pequeno delay para não sobrecarregar
    setTimeout(() => {
      sendNextChunk(transferId, targetPeerId, chunkIndex + 1);
    }, 10);
  };

  reader.readAsArrayBuffer(blob);
}

// Processar chunk de arquivo recebido
export function handleFileChunk(from, data) {
  if (!data || !data.transferId || !data.chunk) return;

  const { transferId, chunkIndex, chunk } = data;
  const fileData = incomingFiles.get(transferId);

  if (!fileData) return;

  // Armazenar chunk
  fileData.chunks[chunkIndex] = new Uint8Array(chunk);
  fileData.receivedChunks++;

  // Atualizar progresso
  fileData.progress = (fileData.receivedChunks / fileData.totalChunks) * 100;

  // Atualizar barra de progresso na interface
  updateFileTransferProgress(from, transferId, fileData.progress);
}

// Atualizar barra de progresso na interface
function updateFileTransferProgress(peerId, transferId, progress) {
  // Encontrar o item do usuário na lista
  const userItem = [...UI.uList.children].find(
    (el) => el.dataset.peerId === peerId || el.textContent.includes(peerId)
  );

  if (!userItem) return;

  // Encontrar o contêiner da solicitação de arquivo
  const fileRequestContainer = userItem.querySelector(
    `.file-request-container[data-transfer-id="${transferId}"]`
  );
  if (!fileRequestContainer) return;

  // Atualizar a barra de progresso
  const progressBar = fileRequestContainer.querySelector(".progress");
  if (progressBar) {
    progressBar.style.width = `${progress}%`;
  }
}

// Processar conclusão de transferência de arquivo
export function handleFileTransferComplete(from, data) {
  if (!data || !data.transferId) return;

  const transferId = data.transferId;
  const fileData = incomingFiles.get(transferId);

  if (!fileData) return;

  // Marcar como concluído
  fileData.completed = true;

  // Combinar chunks em um único arquivo
  const fileBlob = combineChunks(fileData);

  // Criar URL para download
  const downloadUrl = URL.createObjectURL(fileBlob);

  // Adicionar mensagem com link para download
  displayFileDownloadMessage(fileData.name, downloadUrl, fileData.size, from);

  // Remover o contêiner de solicitação de arquivo após um breve intervalo
  setTimeout(() => {
    // Encontrar o item do usuário na lista
    const userItem = [...UI.uList.children].find(
      (el) => el.dataset.peerId === from || el.textContent.includes(from)
    );

    if (!userItem) return;

    // Encontrar e remover o contêiner da solicitação de arquivo
    const fileRequestContainer = userItem.querySelector(
      `.file-request-container[data-transfer-id="${transferId}"]`
    );
    if (fileRequestContainer) {
      userItem.removeChild(fileRequestContainer);
    }
  }, 2000);
}

// Combinar chunks em um único arquivo
function combineChunks(fileData) {
  // Calcular tamanho total
  let totalLength = 0;
  fileData.chunks.forEach((chunk) => {
    if (chunk) totalLength += chunk.length;
  });

  // Criar array combinado
  const combined = new Uint8Array(totalLength);
  let offset = 0;

  fileData.chunks.forEach((chunk) => {
    if (chunk) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
  });

  // Criar blob com o tipo correto
  return new Blob([combined], {
    type: fileData.type || "application/octet-stream",
  });
}

// Exibir mensagem com link para download
function displayFileDownloadMessage(fileName, url, fileSize, from) {
  // Determinar ícone com base no tipo de arquivo
  const fileExtension = fileName.split(".").pop().toLowerCase();
  let fileIcon = "📄"; // Padrão para qualquer arquivo

  // Escolher ícone baseado na extensão
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

  // Criar HTML para a mensagem
  const fileMessage = `
    <div class="file-message">
      <span class="file-icon">${fileIcon}</span>
      <a href="${url}" class="file-download-link" download="${fileName}">${fileName}</a>
      <span class="file-size">(${formatFileSize(fileSize)})</span>
    </div>
  `;

  // Adicionar à lista de mensagens
  const t = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  UI.msgs.insertAdjacentHTML(
    "afterbegin",
    `<li><small>[${t}]</small> <strong>${from}:</strong> ${fileMessage}</li>`
  );
}

// Enviar mensagem para um peer específico
function sendToPeer(peerId, data) {
  const conn = peerMod.getConnections().get(peerId);
  if (conn?.open) {
    conn.send(data);
    return true;
  }
  return false;
}
