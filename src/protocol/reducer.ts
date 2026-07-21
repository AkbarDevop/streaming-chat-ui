import type {
  LocalTurn,
  ProtocolEvent,
  ProtocolState,
  ServerMessage,
} from "./types";

export function createInitialProtocolState(): ProtocolState {
  return {
    connection: "disconnected",
    history: [],
    localTurns: [],
    activeTurn: null,
    completedTurn: null,
    unresolvedTurn: null,
    lastError: null,
    nextSequence: 1,
  };
}

function updateLocalTurn(
  turns: LocalTurn[],
  sequence: number,
  update: (turn: LocalTurn) => LocalTurn,
): LocalTurn[] {
  return turns.map((turn) => (turn.sequence === sequence ? update(turn) : turn));
}

function connectionAfterError(
  current: ProtocolState["connection"],
  error: Extract<ServerMessage, { type: "Error" }>,
): ProtocolState["connection"] {
  switch (error.code) {
    case "init_required":
    case "initialization_failed":
      return "awaiting-history";
    case "already_initialized":
      return "ready";
    default:
      return current;
  }
}

function reduceServerMessage(
  state: ProtocolState,
  message: ServerMessage,
): ProtocolState {
  switch (message.type) {
    case "History":
      if (state.connection !== "awaiting-history") {
        throw new Error("History received outside initialization");
      }
      return {
        ...state,
        connection: "ready",
        history: message.items,
        localTurns: [],
        activeTurn: null,
        completedTurn: null,
        unresolvedTurn: null,
        lastError: null,
      };

    case "AssistantDelta": {
      if (!state.activeTurn) {
        throw new Error("AssistantDelta without active turn");
      }

      const sequence = state.activeTurn.sequence;
      const assistantBuffer = state.activeTurn.assistantBuffer + message.content;
      return {
        ...state,
        activeTurn: {
          ...state.activeTurn,
          phase: "streaming",
          assistantBuffer,
        },
        localTurns: updateLocalTurn(state.localTurns, sequence, (turn) => ({
          ...turn,
          assistantContent: assistantBuffer,
        })),
      };
    }

    case "AssistantDone": {
      if (!state.activeTurn) {
        throw new Error("AssistantDone without active turn");
      }

      const activeTurn = state.activeTurn;
      const status =
        message.finish_reason === "completed"
          ? "completed"
          : message.finish_reason === "incomplete"
            ? "incomplete"
            : "failed";

      return {
        ...state,
        activeTurn: null,
        localTurns: updateLocalTurn(
          state.localTurns,
          activeTurn.sequence,
          (turn) => ({
            ...turn,
            assistantContent: message.content,
            finishReason: message.finish_reason,
            status,
          }),
        ),
        completedTurn: {
          userContent: activeTurn.userContent,
          content: message.content,
          finishReason: message.finish_reason,
          persisted: message.finish_reason === "completed",
        },
        lastError: null,
      };
    }

    case "Error": {
      const activeTurn = state.activeTurn;
      return {
        ...state,
        connection: connectionAfterError(state.connection, message),
        activeTurn: null,
        localTurns: activeTurn
          ? updateLocalTurn(state.localTurns, activeTurn.sequence, (turn) => ({
              ...turn,
              status: "failed",
              errorCode: message.code,
            }))
          : state.localTurns,
        lastError: message,
      };
    }
  }
}

export function protocolReducer(
  state: ProtocolState,
  event: ProtocolEvent,
): ProtocolState {
  switch (event.type) {
    case "CONNECT_STARTED":
      return { ...state, connection: "connecting", lastError: null };

    case "SOCKET_OPENED":
      if (state.connection !== "connecting") {
        throw new Error("Socket opened outside connection attempt");
      }
      return { ...state, connection: "awaiting-history" };

    case "USER_MESSAGE_SENT": {
      if (state.connection !== "ready") {
        throw new Error("Cannot send before History");
      }
      if (state.activeTurn) {
        throw new Error("Only one active turn is allowed");
      }

      const sequence = state.nextSequence;
      return {
        ...state,
        activeTurn: {
          sequence,
          userContent: event.content,
          assistantBuffer: "",
          phase: "awaiting-response",
        },
        localTurns: [
          ...state.localTurns,
          {
            sequence,
            userContent: event.content,
            assistantContent: "",
            status: "active",
          },
        ],
        completedTurn: null,
        unresolvedTurn: null,
        lastError: null,
        nextSequence: sequence + 1,
      };
    }

    case "SERVER_MESSAGE":
      return reduceServerMessage(state, event.message);

    case "SOCKET_CLOSED": {
      const activeTurn = state.activeTurn;
      return {
        ...state,
        connection: "disconnected",
        activeTurn: null,
        localTurns: activeTurn
          ? updateLocalTurn(state.localTurns, activeTurn.sequence, (turn) => ({
              ...turn,
              status: "unresolved",
            }))
          : state.localTurns,
        unresolvedTurn: activeTurn
          ? {
              userContent: activeTurn.userContent,
              partialAssistantContent: activeTurn.assistantBuffer,
              reason: "connection-lost",
            }
          : state.unresolvedTurn,
      };
    }

    case "PROTOCOL_ERROR": {
      const activeTurn = state.activeTurn;
      return {
        ...state,
        connection: "disconnected",
        activeTurn: null,
        localTurns: activeTurn
          ? updateLocalTurn(state.localTurns, activeTurn.sequence, (turn) => ({
              ...turn,
              status: "unresolved",
              errorCode: "protocol_error",
            }))
          : state.localTurns,
        unresolvedTurn: activeTurn
          ? {
              userContent: activeTurn.userContent,
              partialAssistantContent: activeTurn.assistantBuffer,
              reason: "protocol-error",
            }
          : state.unresolvedTurn,
        lastError: {
          type: "Error",
          code: "protocol_error",
          message: event.message,
        },
      };
    }
  }
}
