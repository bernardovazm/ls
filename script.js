const peer = new Peer();
let conn;
let currentDate;

peer.on("open", (id) => {
  document.getElementById("yourPeerId").innerText = `Your ID: ${id}`;
});

document.getElementById("sendButton").addEventListener("click", () => {
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
});

function setupConnection(otherUser) {
  conn.on("open", () => {
    console.log("P2P connection established successfully.");
  });
  conn.on("data", (data) => {
    displayMessage(otherUser, data);
  });
}

function displayMessage(sender, message) {
  const receivedMessages = document.getElementById("receivedMessages");
  if (receivedMessages.innerHTML == "No messages :(") {
    receivedMessages.innerHTML = "";
  }
  if (new Date().toLocaleDateString() !== currentDate) {
    receivedMessages.innerHTML += `<p>${new Date().toLocaleDateString()}</p>`;
  }
  currentDate = new Date().toLocaleDateString();
  receivedMessages.innerHTML += `<li><small>[${new Date().toLocaleTimeString(
    "en-GB",
    { hour: "numeric", minute: "numeric" }
  )}]</small> <strong>${sender}:</strong> ${message}</li>`;
}

peer.on("connection", (incomingConn) => {
  conn = incomingConn;
  setupConnection();
});
