export const generateMessageKey = (prefix) =>
    `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
