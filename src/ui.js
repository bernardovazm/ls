import { sanitizeText, safeSetText } from "./sanitize.js";
export const $ = (q) => document.querySelector(q);

export const UI = {
  id: $("#yourPeerId"),
  pid: $("#peerIdInput"),
  msg: $("#messageInput"),
  mic: $("#micCheckbox"),
  micLabel: $("#micLabel"),
  camera: $("#cameraCheckbox"),
  cameraLabel: $("#cameraLabel"),
  cameraOptions: $("#cameraOptions"),
  cameraSelect: $("#cameraSelect"),
  localVideo: $("#localVideo"),
  localVideoContainer: $("#localVideoContainer"),
  screen: $("#screenCheckbox"),
  screenLabel: $("#screenLabel"),
  screenVideo: $("#screenVideo"),
  screenContainer: $("#screenContainer"),
  ai: $("#aiCheckbox"),
  tChk: $("#translateCheckbox"),
  tLbl: $("#translateLabel"),
  tBox: $("#translation"),
  load: $("#loadingIndicator"),
  loading: $("#loadingIndicator"),
  sendBtn: $("#sendButton"),
  addBtn: $("#addUserBtn"),
  shareBtn: $("#shareBtn"),
  settingsBtn: $("#settingsBtn"),
  uList: $("#userList"),
  msgs: $("#receivedMessages"),
  audio: $("#remoteAudio"),

  // File transfer elements
  fileInput: $("#fileInput"),
  selectFileBtn: $("#selectFileBtn"),
  fileInfo: $("#fileInfo"),
  fileName: $("#fileName"),
  fileSize: $("#fileSize"),

  // Settings modal elements
  settingsModal: $("#settingsModal"),
  inboxUrl: $("#inboxUrl"),
  saveSettingsBtn: $("#saveSettingsBtn"),
  testInboxBtn: $("#testInboxBtn"),
  resetDataBtn: $("#resetDataBtn"),
  closeModal: $(".close-modal"),

  // Sanitize functions
  setSafeText(element, text) {
    safeSetText(element, text);
  },

  createSafeListItem(id, content, attributes = {}) {
    const li = document.createElement("li");

    if (id) {
      li.dataset.peerId = sanitizeText(id);
    }

    for (const [key, value] of Object.entries(attributes)) {
      if (key.startsWith("data-")) {
        li.dataset[key.slice(5)] = sanitizeText(value);
      }
    }

    if (content) {
      li.textContent = sanitizeText(content);
    }

    return li;
  },
  createSafeElement(tag, attributes = {}, content = "") {
    const element = document.createElement(tag);

    for (const [key, value] of Object.entries(attributes)) {
      if (key === "className") {
        element.className = sanitizeText(value);
      } else if (key.startsWith("data-")) {
        element.dataset[key.slice(5)] = sanitizeText(value);
      } else if (["id", "type", "title", "alt", "src", "href"].includes(key)) {
        element.setAttribute(key, sanitizeText(value));
      }
    }
    if (content) {
      element.textContent = sanitizeText(content);
    }
    return element;
  },
};
