import { describe, expect, it } from "vitest";
import {
  countUnicodeScalars,
  decodeServerMessage,
  encodeInit,
  encodeUserMessage,
  validateUserContent,
} from "./codec";
import { DEFAULT_FRAMEWORKS } from "./types";

describe("client encoders", () => {
  it("emits only the documented Init fields", () => {
    expect(JSON.parse(encodeInit(DEFAULT_FRAMEWORKS))).toEqual({
      type: "Init",
      frameworks: DEFAULT_FRAMEWORKS,
    });
  });

  it("counts Unicode scalar values rather than UTF-16 code units", () => {
    expect("😀".length).toBe(2);
    expect(countUnicodeScalars("A😀B")).toBe(3);
  });

  it("enforces the 32,000 scalar limit", () => {
    expect(() => validateUserContent("😀".repeat(32_000))).not.toThrow();
    expect(() => encodeUserMessage("😀".repeat(32_001))).toThrow(
      "User message exceeds 32,000 Unicode scalar values",
    );
  });

  it("emits only the documented UserMessage fields", () => {
    expect(JSON.parse(encodeUserMessage("Hello"))).toEqual({
      type: "UserMessage",
      content: "Hello",
    });
  });
});

describe("server decoder", () => {
  it("decodes all documented server variants", () => {
    expect(decodeServerMessage('{"type":"History","items":[]}')).toEqual({
      type: "History",
      items: [],
    });
    expect(
      decodeServerMessage('{"type":"AssistantDelta","content":"A"}'),
    ).toEqual({ type: "AssistantDelta", content: "A" });
    expect(
      decodeServerMessage(
        '{"type":"AssistantDone","content":"AB","finish_reason":null}',
      ),
    ).toEqual({ type: "AssistantDone", content: "AB", finish_reason: null });
    expect(
      decodeServerMessage(
        '{"type":"Error","code":"init_required","message":"Initialize first"}',
      ),
    ).toEqual({
      type: "Error",
      code: "init_required",
      message: "Initialize first",
    });
  });

  it("accepts an opaque nine-number timestamp", () => {
    const message = decodeServerMessage(
      '{"type":"History","items":[{"role":"user","content":"Hi","created_at":[2024,1,0,0,0,0,0,0,0]}]}',
    );
    expect(message.type).toBe("History");
    if (message.type === "History") {
      expect(message.items[0].created_at).toHaveLength(9);
    }
  });

  it.each([
    '[{"type":"AssistantDelta","content":"A"}]',
    '{"type":"AssistantStarted"}',
    '{"type":"assistantDelta","content":"A"}',
    '{"type":"AssistantDone","content":"missing reason"}',
    '{"type":"AssistantDone","content":"bad reason","finish_reason":"stop"}',
    '{"type":"AssistantDelta","content":1}',
    '{"type":"Error","code":1,"message":"Bad"}',
    '{"type":"History","items":[{"role":"user","content":"Hi","created_at":[1,2]}]}',
    '{"type":"History","items":[{"role":"tool","content":"Hidden","created_at":[1,2,3,4,5,6,7,8,9]}]}',
  ])("rejects protocol-invalid input: %s", (input) => {
    expect(() => decodeServerMessage(input)).toThrow();
  });

  it("ignores undocumented server fields without assigning them meaning", () => {
    expect(
      decodeServerMessage(
        '{"type":"AssistantDelta","content":"A","sequence":42}',
      ),
    ).toEqual({ type: "AssistantDelta", content: "A" });
  });
});
