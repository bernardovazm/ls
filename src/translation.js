import { pipeline } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
import { UI } from "./ui.js";
import { store } from "./storage.js";

const map = {
  pt: "por_Latn",
  es: "spa_Latn",
  fr: "fra_Latn",
  de: "deu_Latn",
  it: "ita_Latn",
  hi: "hin_Deva",
  zh: "zho_Hans",
  ja: "jpn_Jpan",
};
const tgt = map[navigator.language.slice(0, 2)] ?? "eng_Latn";

let translator;

export async function translateIfEnabled(text) {
  if (!store.get("autoTranslate", false) || tgt === "eng_Latn") return text;
  translator ??= await pipeline(
    "translation",
    "Xenova/nllb-200-distilled-600M"
  );
  const [{ translation_text }] = await translator(text, {
    src_lang: "eng_Latn",
    tgt_lang: tgt,
  });
  return `${translation_text} (${text})`;
}

export function startCountdown() {
  if (tgt === "eng_Latn") {
    UI.tBox.hidden = true;
    return;
  }

  const enabled = store.get("autoTranslate", false);
  UI.tChk.checked = enabled;
  let s = 10;

  const id = setInterval(() => {
    if (--s) UI.tLbl.textContent = `Start automatic translation in ${s}s…`;
    else {
      clearInterval(id);
      UI.tLbl.textContent = enabled ? "Translating…" : "";
      UI.tChk.disabled = true;
      if (enabled) translatePage();
      else UI.tChk.style.display = "none";
    }
  }, 1000);

  UI.tChk.addEventListener("change", () =>
    store.set("autoTranslate", UI.tChk.checked)
  );
}

async function translatePage() {
  const els = [
    ...document.body.querySelectorAll("*:not(script):not(style):not(noscript)"),
  ];
  for (const el of els) {
    if (
      !el.children.length &&
      el.textContent.trim() &&
      el.textContent !== "LS"
    ) {
      el.textContent = await translateIfEnabled(el.textContent);
    }
  }
}
