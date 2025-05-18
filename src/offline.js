import { store } from "./storage.js";
import { sanitizeText } from "./sanitize.js";

const INBOX_URL_KEY = "inboxUrl";

const INBOX_PEERS_KEY = "inboxPeers";

/**
 * @param {string} url
 */
export function saveInboxUrl(url) {
  store.set(INBOX_URL_KEY, url);
}

/**
 * @returns {string}
 */
export function getInboxUrl() {
  return store.get(INBOX_URL_KEY, "");
}

/**
 * @param {string} recipientId
 * @param {string} senderId
 * @param {string} inboxUrl
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export async function sendOfflineMessage(
  recipientId,
  senderId,
  inboxUrl,
  message
) {
  if (!inboxUrl) return false;

  try {
    // Sanitize message before sending to inbox
    const sanitizedMessage = sanitizeText(message);

    const payload = {
      to: recipientId,
      from: senderId,
      message: sanitizedMessage,
      timestamp: Date.now(),
    };

    let usePutFallback = false;

    try {
      const response = await fetch(inboxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        return true;
      } else if (response.status === 405) {
        usePutFallback = true;
      } else {
        console.error(
          `Error sending message to ${recipientId}: ${response.status}`
        );
        return false;
      }
    } catch (error) {
      if (
        error.message &&
        (error.message.includes("405") ||
          error.message.includes("Method Not Allowed") ||
          error.message.includes("CORS"))
      ) {
        usePutFallback = true;
      } else {
        console.error("Error with POST:", error);
        return false;
      }
    }

    if (usePutFallback) {
      console.log("Trying fallback for PUT to send message");

      try {
        const baseUrl = new URL(inboxUrl);
        baseUrl.search = "";

        const getResponse = await fetch(baseUrl.toString(), {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });

        if (!getResponse.ok) {
          console.error(`Error fetching current data: ${getResponse.status}`);
          return false;
        }

        const { peers, messages } = await processInboxData(getResponse);

        const updatedPeers = [...peers];
        if (!updatedPeers.includes(recipientId)) {
          console.log(`Adding recipient ID ${recipientId} to inbox`);
          updatedPeers.push(recipientId);
        }

        const updatedMessages = [...messages, payload];

        const updatedData = [...updatedPeers, ...updatedMessages];

        const putResponse = await fetch(baseUrl.toString(), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedData),
        });

        if (!putResponse.ok) {
          console.error(`Error sending message via PUT: ${putResponse.status}`);
          return false;
        }

        return true;
      } catch (error) {
        console.error("Error trying fallback for PUT:", error);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error("Error sending offline message:", error);
    return false;
  }
}

/**
 * @param {Response} response
 * @returns {Promise<Object>}
 */
async function processInboxData(response) {
  const result = {
    peers: [],
    messages: [],
  };

  try {
    const data = await response.json();

    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (typeof item === "string") {
          result.peers.push(item);
        } else if (typeof item === "object" && item !== null) {
          if (item.to && item.from && item.message) {
            // Sanitize messages as they come in
            if (item.message && typeof item.message === "string") {
              item.message = sanitizeText(item.message);
            }
            result.messages.push(item);
          }
        }
      });
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.peers)) {
        result.peers = data.peers.filter((id) => typeof id === "string");
      }

      if (Array.isArray(data.messages)) {
        // Sanitize all messages in the array
        result.messages = data.messages.map((msg) => {
          if (msg.message && typeof msg.message === "string") {
            return { ...msg, message: sanitizeText(msg.message) };
          }
          return msg;
        });
      }
    }
  } catch (error) {
    console.error("Error processing inbox data:", error);
  }

  return result;
}

/**
 * @param {string} inboxUrl
 * @param {string} recipientId
 * @returns {Promise<Array>}
 */
export async function fetchOfflineMessages(inboxUrl, recipientId) {
  if (!inboxUrl || !recipientId) return [];

  try {
    console.log(`Searching messages for ${recipientId} in ${inboxUrl}`);

    const baseUrl = new URL(inboxUrl);
    baseUrl.search = "";

    const response = await fetch(baseUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Error fetching messages: ${response.status}`);
    }

    const result = {
      peers: [],
      messages: [],
      myMessages: [],
    };

    try {
      const data = await response.json();

      if (Array.isArray(data)) {
        data.forEach((item) => {
          if (typeof item === "string") {
            result.peers.push(item);
          } else if (typeof item === "object" && item !== null) {
            if (item.to && item.from && item.message) {
              if (item.to === recipientId) {
                result.myMessages.push(item);
              } else {
                result.messages.push(item);
              }
            }
          }
        });
      } else if (data && typeof data === "object") {
        if (Array.isArray(data.messages)) {
          data.messages.forEach((msg) => {
            if (msg.to === recipientId) {
              result.myMessages.push(msg);
            } else {
              result.messages.push(msg);
            }
          });
        }

        if (Array.isArray(data.peers)) {
          result.peers = data.peers.filter((id) => typeof id === "string");
        }
      } else {
        return [];
      }
    } catch (e) {
      console.error("Error processing JSON of messages:", e);
      return [];
    }

    console.log(
      `Found ${result.myMessages.length} messages for ${recipientId}`
    );

    if (result.myMessages.length > 0) {
      try {
        const updatedData = [...result.peers, ...result.messages];

        const putResponse = await fetch(baseUrl.toString(), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedData),
        });

        if (!putResponse.ok && putResponse.status !== 405) {
          console.warn(
            `Unable to update inbox after reading: ${putResponse.status}`
          );
        } else {
          console.log(
            `Inbox updated, removed ${result.myMessages.length} messages for ${recipientId}`
          );
        }
      } catch (error) {
        console.warn("Error trying to update inbox after reading:", error);
      }
    }

    return result.myMessages;
  } catch (error) {
    console.error("Error fetching offline messages:", error);
    return [];
  }
}

/**
 * @returns {string|null}
 */
export function checkInboxFromUrl() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get("inbox");
  } catch (error) {
    console.error("Error checking URL for inbox:", error);
    return null;
  }
}

/**
 * @param {string} inboxUrl
 * @param {string} peerId
 * @returns {Promise<Array>}
 */
export async function registerPeerIdWithInbox(inboxUrl, peerId) {
  if (!inboxUrl || !peerId) return [];

  try {
    let usePutFallback = false;

    try {
      const registerUrl = new URL(inboxUrl);
      registerUrl.searchParams.append("action", "register");
      registerUrl.searchParams.append("peerId", peerId);

      const response = await fetch(registerUrl.toString(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ peerId }),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.peers)) {
          store.set(INBOX_PEERS_KEY, data.peers);
          return data.peers;
        }
        return [];
      } else if (response.status === 405) {
        usePutFallback = true;
      } else {
        throw new Error(`Error registering ID in inbox: ${response.status}`);
      }
    } catch (error) {
      if (
        error.message &&
        (error.message.includes("405") ||
          error.message.includes("Method Not Allowed") ||
          error.message.includes("CORS"))
      ) {
        usePutFallback = true;
      } else {
        throw error;
      }
    }

    if (usePutFallback) {
      console.log(
        "POST method not allowed, trying fallback for PUT directly on base URL"
      );

      const { peers, messages } = await fetchExistingPeers(inboxUrl);

      let updatedPeers = Array.isArray(peers) ? [...peers] : [];
      if (!updatedPeers.includes(peerId)) {
        updatedPeers.push(peerId);
      }

      let updatedData;
      if (messages && messages.length > 0) {
        updatedData = [...updatedPeers, ...messages];
      } else {
        updatedData = updatedPeers;
      }

      try {
        const putResponse = await fetch(inboxUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatedData),
        });

        if (!putResponse.ok) {
          throw new Error(
            `Error registering ID via PUT: ${putResponse.status}`
          );
        }

        store.set(INBOX_PEERS_KEY, updatedPeers);
        return updatedPeers;
      } catch (putError) {
        console.error("Error registering ID via PUT:", putError);
        throw putError;
      }
    }
  } catch (error) {
    console.error("Error registering ID in inbox:", error);

    const localPeers = getInboxPeers();
    if (localPeers.length > 0) {
      return localPeers;
    }

    return [];
  }
}

/**
 * @param {string} inboxUrl
 * @returns {Promise<Object>}
 */
async function fetchExistingPeers(inboxUrl) {
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
      console.warn(`Error fetching existing peers: ${response.status}`);
      return { peers: [], messages: [] };
    }

    let data;
    try {
      data = await response.json();
    } catch (e) {
      console.warn("Error processing JSON of peers:", e);
      return { peers: [], messages: [] };
    }

    const result = { peers: [], messages: [] };

    if (Array.isArray(data)) {
      data.forEach((item) => {
        if (typeof item === "string") {
          result.peers.push(item);
        } else if (typeof item === "object" && item !== null) {
          if (item.to && item.from && item.message) {
            result.messages.push(item);
          }
        }
      });
    } else if (data && typeof data === "object") {
      if (Array.isArray(data.peers)) {
        result.peers = data.peers.filter((id) => typeof id === "string");
      }

      if (Array.isArray(data.messages)) {
        result.messages = data.messages;
      }

      if (result.peers.length === 0 && result.messages.length === 0) {
        for (const key in data) {
          if (typeof data[key] === "string" && data[key].length > 0) {
            result.peers.push(data[key]);
          } else if (typeof data[key] === "object" && data[key] !== null) {
            if (data[key].to && data[key].from && data[key].message) {
              result.messages.push(data[key]);
            }
          }
        }
      }
    }

    return result;
  } catch (error) {
    console.error("Error fetching existing peers:", error);
    return { peers: [], messages: [] };
  }
}

/**
 * @returns {Array}
 */
export function getInboxPeers() {
  return store.get(INBOX_PEERS_KEY, []);
}

/**
 * @param {Object} inboxUrls
 * @param {string} userId
 * @param {string} defaultInboxUrl
 * @returns {string}
 */
export function getUserInboxUrl(inboxUrls, userId, defaultInboxUrl = "") {
  return inboxUrls.get(userId) || defaultInboxUrl;
}

/**
 * @param {string} inboxUrl
 * @returns {Promise<Object>}
 */
export async function testInboxConnection(inboxUrl) {
  if (!inboxUrl) {
    return {
      success: false,
      error: "Inbox URL not provided",
      details: null,
    };
  }

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
      return {
        success: false,
        error: `HTTP error ${response.status}`,
        details: `The server returned an error status: ${response.status} ${response.statusText}`,
      };
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      return {
        success: false,
        error: "Invalid content",
        details: "The server responded, but the content is not a valid JSON.",
      };
    }

    const testId = `test_${Date.now()}`;

    if (Array.isArray(data)) {
      data.push(testId);

      const putResponse = await fetch(baseUrl.toString(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!putResponse.ok) {
        return {
          success: false,
          error: "No write permission",
          details: `Unable to write to inbox. Error: ${putResponse.status} ${putResponse.statusText}`,
        };
      }

      data.pop();

      await fetch(baseUrl.toString(), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      return {
        success: true,
        error: null,
        details: {
          read: true,
          write: true,
          content: data,
        },
      };
    } else {
      return {
        success: true,
        error: null,
        details: {
          read: true,
          write: false,
          content: data,
        },
      };
    }
  } catch (error) {
    return {
      success: false,
      error: "Connection error",
      details: error.message,
    };
  }
}
