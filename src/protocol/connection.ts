export const CHAT_SUBPROTOCOL = "openai-chat.v1";
export const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function validateUsername(value: string): string {
  const normalized = normalizeUsername(value);
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new Error(
      "Username must be 3–32 characters using only lowercase letters, numbers, and underscores.",
    );
  }
  return normalized;
}

export function buildChatWebSocketUrl(baseUrl: string, username: string): string {
  const normalizedUsername = validateUsername(username);
  const url = new URL(baseUrl);

  if (url.protocol !== "ws:" && url.protocol !== "wss:") {
    throw new Error("WebSocket URL must begin with ws:// or wss://.");
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (!path.endsWith("/chat")) {
    url.pathname = `${path}/chat`.replace(/\/{2,}/g, "/");
  }
  url.searchParams.set("username", normalizedUsername);

  return url.toString();
}
