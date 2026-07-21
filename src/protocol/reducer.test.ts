import { describe, expect, it } from "vitest";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type { ProtocolState, ServerMessage } from "./types";

function readyState(): ProtocolState {
  let state = createInitialProtocolState();
  state = protocolReducer(state, { type: "CONNECT_STARTED" });
  state = protocolReducer(state, { type: "SOCKET_OPENED" });
  return protocolReducer(state, {
    type: "SERVER_MESSAGE",
    message: { type: "History", items: [] },
  });
}

function server(state: ProtocolState, message: ServerMessage): ProtocolState {
  return protocolReducer(state, { type: "SERVER_MESSAGE", message });
}

describe("protocol reducer", () => {
  it("requires History before a user turn", () => {
    const state = protocolReducer(createInitialProtocolState(), {
      type: "CONNECT_STARTED",
    });
    expect(() =>
      protocolReducer(state, { type: "USER_MESSAGE_SENT", content: "Too soon" }),
    ).toThrow("Cannot send before History");
  });

  it("appends deltas and treats Done content as authoritative", () => {
    let state = readyState();
    state = protocolReducer(state, {
      type: "USER_MESSAGE_SENT",
      content: "Test",
    });
    state = server(state, { type: "AssistantDelta", content: "draft" });
    state = server(state, {
      type: "AssistantDone",
      content: "authoritative final",
      finish_reason: "completed",
    });

    expect(state.activeTurn).toBeNull();
    expect(state.completedTurn).toEqual({
      userContent: "Test",
      content: "authoritative final",
      finishReason: "completed",
      persisted: true,
    });
    expect(state.localTurns[0].assistantContent).toBe("authoritative final");
  });

  it("permits Done without deltas and marks incomplete output non-durable", () => {
    let state = readyState();
    state = protocolReducer(state, {
      type: "USER_MESSAGE_SENT",
      content: "Test",
    });
    state = server(state, {
      type: "AssistantDone",
      content: "Partial",
      finish_reason: "incomplete",
    });

    expect(state.completedTurn?.persisted).toBe(false);
    expect(state.localTurns[0].status).toBe("incomplete");
  });

  it("ends a turn on Error without assuming the connection closed", () => {
    let state = readyState();
    state = protocolReducer(state, {
      type: "USER_MESSAGE_SENT",
      content: "Test",
    });
    state = server(state, { type: "AssistantDelta", content: "Partial" });
    state = server(state, {
      type: "Error",
      code: "assistant_stream_failed",
      message: "Stream failed",
    });

    expect(state.connection).toBe("ready");
    expect(state.activeTurn).toBeNull();
    expect(state.localTurns[0]).toMatchObject({
      assistantContent: "Partial",
      status: "failed",
      errorCode: "assistant_stream_failed",
    });
  });

  it("preserves an interrupted turn as unresolved on socket close", () => {
    let state = readyState();
    state = protocolReducer(state, {
      type: "USER_MESSAGE_SENT",
      content: "Uncertain",
    });
    state = server(state, { type: "AssistantDelta", content: "Part" });
    state = protocolReducer(state, { type: "SOCKET_CLOSED" });

    expect(state.connection).toBe("disconnected");
    expect(state.unresolvedTurn).toEqual({
      userContent: "Uncertain",
      partialAssistantContent: "Part",
      reason: "connection-lost",
    });
    expect(state.localTurns[0].status).toBe("unresolved");
  });

  it("rejects a second History snapshot on one initialized connection", () => {
    const state = readyState();
    expect(() =>
      server(state, { type: "History", items: [] }),
    ).toThrow("History received outside initialization");
  });
});
