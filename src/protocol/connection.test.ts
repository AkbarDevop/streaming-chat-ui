import { describe, expect, it } from "vitest";
import {
  buildChatWebSocketUrl,
  normalizeUsername,
  validateUsername,
} from "./connection";

describe("WebSocket connection handshake", () => {
  it("normalizes usernames before validation", () => {
    expect(normalizeUsername("  Alice_123 ")).toBe("alice_123");
    expect(validateUsername("Alice_123")).toBe("alice_123");
  });

  it("rejects invalid usernames", () => {
    expect(() => validateUsername("ab")).toThrow("3–32 characters");
    expect(() => validateUsername("alice-smith")).toThrow("lowercase letters");
    expect(() => validateUsername("alice smith")).toThrow("lowercase letters");
  });

  it("appends the chat route and normalized username", () => {
    expect(buildChatWebSocketUrl("wss://example.test", "Alice_123")).toBe(
      "wss://example.test/chat?username=alice_123",
    );
  });

  it("preserves the chat route and other query parameters", () => {
    expect(
      buildChatWebSocketUrl(
        "ws://localhost:8080/chat?region=us&username=stale",
        "Bob_456",
      ),
    ).toBe("ws://localhost:8080/chat?region=us&username=bob_456");
  });
});
