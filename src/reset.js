import { store } from "./storage.js";
import { UI } from "./ui.js";
import * as peerMod from "./peer.js";
import * as camera from "./camera.js";
import * as audio from "./audio.js";
import * as offline from "./offline.js";

/**
 * Limpa o localStorage e todas as informações armazenadas
 * @param {Function} setStatus - Função para definir status
 * @param {HTMLInputElement} statusInput - Input do status
 * @param {Map} statuses - Mapa de status
 * @param {Map} inboxUrls - Mapa de URLs de inbox
 * @param {Function} loadIdsFromUrl - Função para carregar IDs da URL
 * @param {Function} checkInboxParam - Função para verificar parâmetros de inbox
 * @param {Function} renderUsers - Função para renderizar usuários
 * @param {Function} updateUrlWithIds - Função para atualizar URL com IDs
 * @param {Function} fetchOfflineMessages - Função para buscar mensagens offline
 * @param {Function} closeSettingsModal - Função para fechar modal de configurações
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
      "Esta ação irá apagar todos os seus dados e reiniciar a aplicação. Deseja continuar?"
    )
  ) {
    return;
  }

  // Verificar se o usuário quer manter o ID atual
  const currentId = store.get("peerId");
  const keepId = confirm("Deseja manter seu ID atual?");

  // Fechar todas as conexões ativas
  for (const conn of peerMod.getConnections().values()) {
    if (conn) {
      conn.close();
    }
  }

  // Destruir o peer atual para forçar a criação de um novo
  peerMod.destroyPeer();

  // Limpar todos os dados do localStorage
  const keys = Object.keys(localStorage);
  for (const key of keys) {
    localStorage.removeItem(key);
  }

  // Reestabelecer o ID atual se o usuário escolheu mantê-lo
  if (keepId && currentId) {
    store.set("peerId", currentId);
  }

  // Limpar variáveis e UI
  statuses.clear();
  inboxUrls.clear();

  // Limpar UI
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

  // Desligar câmera e áudio se estiverem ativos
  if (camera.isActive()) {
    camera.toggle();
  }
  if (audio.isActive()) {
    audio.toggle();
  }

  // Reiniciar toda a aplicação, executando as mesmas funções da inicialização
  await peerMod.ensurePeer();
  const myId = store.get("peerId");
  UI.id.textContent = myId;
  setStatus(myId, "");

  // Recarregar dados da URL (se houver)
  loadIdsFromUrl();
  await checkInboxParam();

  // Renderizar usuários novamente
  renderUsers();

  // Atualizar URL
  updateUrlWithIds();

  // Verificar mensagens offline
  await fetchOfflineMessages(myId);

  // Fechar modal
  closeSettingsModal();

  alert("Dados limpos com sucesso. A aplicação foi reiniciada.");
}
