import { validateUserContent } from "./codec";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type {
  ChatProtocolClient,
  Frameworks,
  ProtocolEvent,
  ProtocolState,
} from "./types";

const RESPONSE_BY_THEME = {
  pattern:
    "Three patterns stand out.\n\nStudents responded most when the task had a visible model, a short time boundary, and room to compare approaches. The energy dipped during open-ended transitions, then recovered as soon as the next move became concrete.\n\nFor the next cycle, keep the comparison moment and test one tighter transition. That gives you a focused change with a result you can actually observe.",
  challenge:
    "The challenge seems less about effort and more about the handoff between instruction and independent work. Students knew the goal, but not always the first move.\n\nTry naming that first move explicitly, then check one minute later: who has started, who is waiting, and what are they waiting for? That small observation should tell you whether the support is working.",
  default:
    "Let’s make this concrete. Start with one moment you can picture clearly: what students were doing, what you expected to happen, and where the two diverged.\n\nFrom there, we can separate the signal from the noise and choose one next move that is small enough to test in your next lesson.",
};

function responseFor(content: string, frameworks: Frameworks): string {
  const normalized = content.toLowerCase();
  const response = normalized.includes("pattern")
    ? RESPONSE_BY_THEME.pattern
    : normalized.includes("challenge") || normalized.includes("stuck")
      ? RESPONSE_BY_THEME.challenge
      : RESPONSE_BY_THEME.default;

  const lens = frameworks.coaching_conversation === "grow" ? "GROW" : "Cognitive Coaching";
  return `${response}\n\nI’m using the ${lens} lens you selected.`;
}

function chunkText(value: string, size: number): string[] {
  const scalars = Array.from(value);
  const chunks: string[] = [];
  for (let index = 0; index < scalars.length; index += size) {
    chunks.push(scalars.slice(index, index + size).join(""));
  }
  return chunks;
}

export class DemoChatProtocol implements ChatProtocolClient {
  private state = createInitialProtocolState();
  private timers = new Set<number>();

  constructor(
    private readonly frameworks: Frameworks,
    private readonly onState: (state: ProtocolState) => void,
  ) {}

  connect(): void {
    this.disconnect();
    this.apply({ type: "CONNECT_STARTED" });
    this.schedule(() => {
      this.apply({ type: "SOCKET_OPENED" });
      this.schedule(() => {
        this.apply({
          type: "SERVER_MESSAGE",
          message: { type: "History", items: [] },
        });
      }, 260);
    }, 180);
  }

  sendUserMessage(content: string): void {
    validateUserContent(content);
    if (this.state.connection !== "ready") {
      throw new Error("Connection is not initialized");
    }
    if (this.state.activeTurn) {
      throw new Error("A turn is already active");
    }

    this.apply({ type: "USER_MESSAGE_SENT", content });
    const response = responseFor(content, this.frameworks);
    const chunks = chunkText(response, 11);

    let delay = 900;
    for (const chunk of chunks) {
      this.schedule(() => {
        this.apply({
          type: "SERVER_MESSAGE",
          message: { type: "AssistantDelta", content: chunk },
        });
      }, delay);
      delay += 34;
    }

    this.schedule(() => {
      this.apply({
        type: "SERVER_MESSAGE",
        message: {
          type: "AssistantDone",
          content: response,
          finish_reason: "completed",
        },
      });
    }, delay + 40);
  }

  disconnect(): void {
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    if (this.state.connection !== "disconnected") {
      this.apply({ type: "SOCKET_CLOSED" });
    }
  }

  getState(): ProtocolState {
    return this.state;
  }

  private schedule(action: () => void, delay: number): void {
    const timer = window.setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, delay);
    this.timers.add(timer);
  }

  private apply(event: ProtocolEvent): void {
    this.state = protocolReducer(this.state, event);
    this.onState(this.state);
  }
}
