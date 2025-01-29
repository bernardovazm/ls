let peer;
let maxDigits = 1000;
let conn;
let currentDate;

async function createPeer() {
  peerId = JSON.parse(localStorage.getItem("peerId"));
  if (conn) {
    conn.close();
  }
  if (peer) {
    peer.destroy();
  }
  while (!peer) {
    try {
      const randomPeer = peerId ?? generateRandomId(maxDigits);
      peer = new Peer(randomPeer);
      await new Promise((resolve, reject) => {
        peer.on("open", resolve);
        peer.on("error", reject);
        localStorage.setItem("peerId", JSON.stringify(peer.id));
      });
    } catch (error) {
      peerId = generateRandomId();
      console.error("Error while creating a peer:", error);
    }
  }
}

createPeer();

function generateRandomId(max = 1000) {
  return JSON.stringify(Math.floor(Math.random() * max));
}

peer.on("open", (id) => {
  document.getElementById("yourPeerId").innerText = `Your ID: ${id}`;
});

window.onload = () => {
  loadMessages();
};

const sendMessage = () => {
  const peerId = document.getElementById("peerIdInput").value;
  const message = document.getElementById("messageInput").value;
  if (!conn) {
    conn = peer.connect(peerId);
    setupConnection(peerId);
  }
  if (message) {
    conn.send(message);
    displayMessage("You", message);
    document.getElementById("messageInput").value = "";
  }
};

document.getElementById("sendButton").addEventListener("click", sendMessage);

document
  .getElementById("messageInput")
  .addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      document.getElementById("sendButton").click();
      event.preventDefault();
    }
  });

function setupConnection(otherUser) {
  conn.on("open", () => {
    console.log("P2P connection established successfully.");
  });
  conn.on("data", (data) => {
    displayMessage(otherUser ?? conn.peer, data);
  });
}

function displayMessage(sender, message) {
  const receivedMessages = document.getElementById("receivedMessages");
  if (receivedMessages.innerHTML == "No messages :(") {
    receivedMessages.innerHTML = "";
  }
  const messageObject = {
    sender: sender,
    message: message,
    timestamp: new Date().toISOString(),
  };
  addMessageToLocalStorage(messageObject);
  updateMessageDisplay();
}

function addMessageToLocalStorage(messageObject) {
  let messages = JSON.parse(localStorage.getItem("messages")) || [];
  messages.push(messageObject);
  localStorage.setItem("messages", JSON.stringify(messages));
}

function loadMessages() {
  const messages = JSON.parse(localStorage.getItem("messages")) || [];
  messages.reverse().forEach((msg) => {
    const date = new Date(msg.timestamp);
    const dateString = date.toLocaleDateString();
    const timeString = date.toLocaleTimeString("en-GB", {
      hour: "numeric",
      minute: "numeric",
    });
    const receivedMessages = document.getElementById("receivedMessages");
    if (receivedMessages.innerHTML == "No messages :(") {
      receivedMessages.innerHTML = "";
    }
    if (currentDate !== dateString) {
      receivedMessages.innerHTML += `<p>${dateString}</p>`;
      currentDate = dateString;
    }
    receivedMessages.innerHTML += `<li><small>[${timeString}]</small> <strong>${msg.sender}:</strong> ${msg.message}</li>`;
  });
}

function updateMessageDisplay() {
  const receivedMessages = document.getElementById("receivedMessages");
  receivedMessages.innerHTML = "";
  loadMessages();
}

peer.on("connection", (incomingConn) => {
  conn = incomingConn;
  setupConnection();
});
