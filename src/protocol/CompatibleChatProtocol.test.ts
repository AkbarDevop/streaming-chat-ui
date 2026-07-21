import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompatibleChatProtocol } from "./CompatibleChatProtocol";
import { DEFAULT_FRAMEWORKS, type ProtocolState } from "./types";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  closeCode?: number;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  constructor(url: string | URL) {
    this.url = String(url);
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number): void {
    this.closeCode = code;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.(new CloseEvent("close", { code }));
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.(new Event("open"));
  }

  receive(data: string): void {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

describe("CompatibleChatProtocol", () => {
  const NativeWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
  });

  afterEach(() => {
    vi.stubGlobal("WebSocket", NativeWebSocket);
  });

  it("initializes once, waits for History, and streams one turn", () => {
    let latest: ProtocolState | undefined;
    const client = new CompatibleChatProtocol(
      "wss://example.test/chat",
      DEFAULT_FRAMEWORKS,
      (state) => { latest = state; },
    );

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    expect(socket.sent).toEqual([
      JSON.stringify({ type: "Init", frameworks: DEFAULT_FRAMEWORKS }),
    ]);

    socket.receive('{"type":"History","items":[]}');
    expect(latest?.connection).toBe("ready");
    client.sendUserMessage("Test");
    expect(JSON.parse(socket.sent[1])).toEqual({ type: "UserMessage", content: "Test" });

    socket.receive('{"type":"AssistantDelta","content":"A"}');
    socket.receive('{"type":"AssistantDelta","content":"B"}');
    socket.receive(
      '{"type":"AssistantDone","content":"AB","finish_reason":"completed"}',
    );
    expect(latest?.completedTurn?.content).toBe("AB");
  });

  it("ignores delayed callbacks from a replaced socket generation", () => {
    const states: ProtocolState[] = [];
    const client = new CompatibleChatProtocol(
      "wss://example.test/chat",
      DEFAULT_FRAMEWORKS,
      (state) => states.push(state),
    );

    client.connect();
    const first = FakeWebSocket.instances[0];
    first.open();
    first.receive('{"type":"History","items":[]}');
    const staleMessage = first.onmessage;

    client.connect();
    const second = FakeWebSocket.instances[1];
    second.open();
    second.receive('{"type":"History","items":[]}');
    staleMessage?.(
      new MessageEvent("message", {
        data: '{"type":"AssistantDelta","content":"stale"}',
      }),
    );

    expect(states.at(-1)?.connection).toBe("ready");
    expect(states.at(-1)?.lastError).toBeNull();
  });

  it("closes with protocol error 1002 for a non-text server frame", () => {
    let latest: ProtocolState | undefined;
    const client = new CompatibleChatProtocol(
      "wss://example.test/chat",
      DEFAULT_FRAMEWORKS,
      (state) => { latest = state; },
    );
    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive('{"type":"History","items":[]}');
    socket.onmessage?.(new MessageEvent("message", { data: new Blob(["binary"]) }));

    expect(socket.closeCode).toBe(1002);
    expect(latest?.connection).toBe("disconnected");
    expect(latest?.lastError?.code).toBe("protocol_error");
  });
});
