export const safeUUID = () =>
  (crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(/-/g, "");
