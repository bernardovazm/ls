const peer = new Peer();
let conn;

peer.on("open", (id) => {
  document.getElementById("yourPeerId").innerText = `Your ID: ${id}`;
});

document.getElementById("sendButton").addEventListener("click", () => {
  const peerId = document.getElementById("peerIdInput").value;
  const message = document.getElementById("messageInput").value;
  if (!conn) {
    conn = peer.connect(peerId);
    setupConnection();
  }
  if (message) {
    conn.send(message);
    displayMessage("You: ", message);
    document.getElementById("messageInput").value = "";
  }
});

function setupConnection() {
  conn.on("open", () => {
    console.log("P2P connection established successfully.");
  });
  conn.on("data", (data) => {
    displayMessage("Other user: ", data);
  });
}

function displayMessage(sender, message) {
  const receivedMessages = document.getElementById("receivedMessages");
  receivedMessages.innerHTML += `<li><strong>${sender}:</strong> ${message}</li>`;
}

peer.on("connection", (incomingConn) => {
  conn = incomingConn;
  setupConnection();
});
