import type {
  FinishReason,
  Frameworks,
  HistoryItem,
  OffsetDateTimeWire,
  ServerMessage,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`${field} must be a string`);
  }

  return value;
}

function parseTimestamp(value: unknown): OffsetDateTimeWire {
  if (
    !Array.isArray(value) ||
    value.length !== 9 ||
    !value.every((part) => typeof part === "number" && Number.isFinite(part))
  ) {
    throw new Error("created_at must be a nine-number array");
  }

  return value as unknown as OffsetDateTimeWire;
}

function parseHistoryItem(value: unknown): HistoryItem {
  if (!isRecord(value)) {
    throw new Error("History item must be an object");
  }

  const role = value.role;
  if (role !== "user" && role !== "assistant") {
    throw new Error("Unknown history role");
  }

  return {
    role,
    content: requireString(value.content, "HistoryItem.content"),
    created_at: parseTimestamp(value.created_at),
  };
}

function parseFinishReason(value: unknown): FinishReason {
  if (
    value === "completed" ||
    value === "incomplete" ||
    value === "failed" ||
    value === null
  ) {
    return value;
  }

  throw new Error("Unknown finish_reason");
}

export function countUnicodeScalars(value: string): number {
  let count = 0;
  for (const _ of value) {
    count += 1;
  }
  return count;
}

export function validateUserContent(content: string): void {
  if (countUnicodeScalars(content) > 32_000) {
    throw new Error("User message exceeds 32,000 Unicode scalar values");
  }
}

export function encodeInit(frameworks: Frameworks): string {
  return JSON.stringify({ type: "Init", frameworks });
}

export function encodeUserMessage(content: string): string {
  validateUserContent(content);
  return JSON.stringify({ type: "UserMessage", content });
}

export function decodeServerMessage(text: string): ServerMessage {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Invalid server JSON");
  }

  if (!isRecord(parsed)) {
    throw new Error("Server message must be a JSON object");
  }

  switch (parsed.type) {
    case "History":
      if (!Array.isArray(parsed.items)) {
        throw new Error("History.items must be an array");
      }
      return { type: "History", items: parsed.items.map(parseHistoryItem) };

    case "AssistantDelta":
      return {
        type: "AssistantDelta",
        content: requireString(parsed.content, "AssistantDelta.content"),
      };

    case "AssistantDone":
      return {
        type: "AssistantDone",
        content: requireString(parsed.content, "AssistantDone.content"),
        finish_reason: parseFinishReason(parsed.finish_reason),
      };

    case "Error":
      return {
        type: "Error",
        code: requireString(parsed.code, "Error.code"),
        message: requireString(parsed.message, "Error.message"),
      };

    default:
      throw new Error(`Unknown server message type: ${String(parsed.type)}`);
  }
}
