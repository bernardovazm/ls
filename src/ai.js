import {
  pipeline,
  env,
} from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3/dist/transformers.min.js";
env.allowLocalModels = false;

let generator = null;

export async function answer(q) {
  const pipe = await getGen();
  const [{ generated_text }] = await pipe(q, { max_new_tokens: 100 });
  return generated_text;
}

async function getGen() {
  if (generator) return generator;
  generator = await pipeline(
    "text2text-generation",
    "Xenova/LaMini-Flan-T5-783M"
  );
  return generator;
}
