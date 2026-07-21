import { decodeServerMessage, encodeInit, encodeUserMessage, validateUserContent } from "./codec";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type {
  ChatProtocolClient,
  Frameworks,
  ProtocolEvent,
  ProtocolState,
} from "./types";

export class CompatibleChatProtocol implements ChatProtocolClient {
  private socket: WebSocket | null = null;
  private generation = 0;
  private state = createInitialProtocolState();

  constructor(
    private readonly url: string,
    private readonly frameworks: Frameworks,
    private readonly onState: (state: ProtocolState) => void,
  ) {}

  connect(): void {
    this.closeCurrent(this.state.connection !== "disconnected");
    const generation = ++this.generation;

    this.apply({ type: "CONNECT_STARTED" });
    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.onopen = () => {
      if (!this.isCurrent(socket, generation)) return;
      this.apply({ type: "SOCKET_OPENED" });
      socket.send(encodeInit(this.frameworks));
    };

    socket.onmessage = (event) => {
      if (!this.isCurrent(socket, generation)) return;
      if (typeof event.data !== "string") {
        this.protocolFailure("Expected WebSocket text frame");
        return;
      }

      try {
        this.apply({
          type: "SERVER_MESSAGE",
          message: decodeServerMessage(event.data),
        });
      } catch (error) {
        this.protocolFailure(
          error instanceof Error ? error.message : "Invalid server message",
        );
      }
    };

    socket.onerror = () => {
      // Browser WebSocket error events do not expose reliable protocol details.
    };

    socket.onclose = () => {
      if (!this.isCurrent(socket, generation)) return;
      this.socket = null;
      this.apply({ type: "SOCKET_CLOSED" });
    };
  }

  sendUserMessage(content: string): void {
    validateUserContent(content);
    if (this.state.connection !== "ready") {
      throw new Error("Connection is not initialized");
    }
    if (this.state.activeTurn) {
      throw new Error("A turn is already active");
    }

    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }

    this.apply({ type: "USER_MESSAGE_SENT", content });
    try {
      socket.send(encodeUserMessage(content));
    } catch (error) {
      this.closeCurrent(true);
      throw error;
    }
  }

  disconnect(): void {
    this.closeCurrent(this.state.connection !== "disconnected");
  }

  getState(): ProtocolState {
    return this.state;
  }

  private apply(event: ProtocolEvent): void {
    this.state = protocolReducer(this.state, event);
    this.onState(this.state);
  }

  private isCurrent(socket: WebSocket, generation: number): boolean {
    return this.socket === socket && this.generation === generation;
  }

  private closeCurrent(updateState: boolean): void {
    this.generation += 1;
    const socket = this.socket;
    this.socket = null;

    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close();
    }

    if (updateState) {
      this.apply({ type: "SOCKET_CLOSED" });
    }
  }

  private protocolFailure(message: string): void {
    this.apply({ type: "PROTOCOL_ERROR", message });
    this.socket?.close(1002, "Protocol error");
  }
}
