export const $ = (q) => document.querySelector(q);

export const UI = {
  id: $("#yourPeerId"),
  pid: $("#peerIdInput"),
  msg: $("#messageInput"),
  mic: $("#micCheckbox"),
  micLabel: $("#micLabel"),
  ai: $("#aiCheckbox"),
  tChk: $("#translateCheckbox"),
  tLbl: $("#translateLabel"),
  tBox: $("#translation"),
  load: $("#loadingIndicator"),
  sendBtn: $("#sendButton"),
  addBtn: $("#addUserBtn"),
  uList: $("#userList"),
  msgs: $("#receivedMessages"),
  audio: $("#remoteAudio"),
};
