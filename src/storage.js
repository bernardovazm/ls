export const store = {
  get: (k, def = []) => JSON.parse(localStorage.getItem(k) || "null") ?? def,
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
