/**
 *
 * @param {string} text
 * @returns {string}
 *
 * @example
 *
 * @example
 */
export function sanitizeText(text) {
  if (typeof text !== "string") {
    return "";
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 *
 * @param {string} html
 * @returns {string}
 *
 * @example
 */
export function sanitizeHTML(html) {
  if (typeof html !== "string") {
    return "";
  }

  if (typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ["b", "i", "em", "strong", "a", "p", "br"],
      ALLOWED_ATTR: ["href", "target", "rel"],
    });
  }

  return sanitizeText(html);
}

/**
 *
 * @param {string} tag
 * @param {Object} attributes
 * @param {string} content
 * @returns {HTMLElement}
 *
 * @example
 * // safe element:
 * const link = createSafeElement('a', {
 *   href: userProvidedUrl,
 *   class: 'link-class'
 * }, 'Click here');
 * container.appendChild(link);
 */
export function createSafeElement(tag, attributes = {}, content = "") {
  const element = document.createElement(tag);

  Object.entries(attributes).forEach(([key, value]) => {
    if (
      [
        "class",
        "id",
        "style",
        "title",
        "alt",
        "href",
        "target",
        "rel",
      ].includes(key)
    ) {
      if (key === "href") {
        const url = String(value);
        if (
          url.startsWith("http://") ||
          url.startsWith("https://") ||
          url.startsWith("/") ||
          url.startsWith("#")
        ) {
          element.setAttribute(key, url);
        }
      } else if (key === "style") {
        const safeStyle = String(value).replace(/[();]/g, "");
        element.setAttribute(key, safeStyle);
      } else {
        element.setAttribute(key, String(value));
      }
    }
  });

  if (content) {
    element.textContent = content;
  }

  return element;
}

/**
 *
 * @param {HTMLElement} element
 * @param {string} position
 * @param {string} text
 * @returns {void}
 *
 * @example
 * safeInsertHTML(messagesList, 'afterbegin', userMessage);
 */
export function safeInsertHTML(element, position, text) {
  const sanitized = sanitizeText(text);
  element.insertAdjacentHTML(position, sanitized);
}

/**
 *
 * @param {HTMLElement} element
 * @param {string} text
 * @returns {void}
 *
 * @example
 * safeSetText(usernameDisplay, receivedUsername);
 */
export function safeSetText(element, text) {
  if (element) {
    element.textContent = text;
  }
}
