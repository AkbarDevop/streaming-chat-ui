import { validateUserContent } from "./codec";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type {
  ChatProtocolClient,
  ProtocolEvent,
  ProtocolState,
} from "./types";

const RESPONSE_BY_THEME = {
  technical:
    "Strong start. You bring the technical side, so I’ll prioritize people who can own customer discovery, distribution, and the commercial story—not just someone with a different job title.\n\nWhat would you want this person to take completely off your plate in the first 90 days? And how many hours a week are you honestly ready to commit?",
  commercial:
    "Got it. You can create demand and talk to customers; the missing half is someone who can turn that signal into a product quickly and make sound technical tradeoffs.\n\nTell me what traction or customer evidence already exists, even if it is messy. That will help me distinguish the right builder from someone who only looks good on paper.",
  explore:
    "That opens a different kind of search. I’ll look for someone who shares your pace and ambition but brings a different problem lens—so you can discover the right company together instead of forcing an idea too early.\n\nWhich domains do you understand unusually well, and what kind of problem would you still care about after two difficult years?",
  default:
    "I’m turning that into a founder brief now. I’m listening for what you can own, where you need leverage, and the kind of working relationship that will survive pressure.\n\nNext, tell me about your actual commitment level, the strongest thing you have built or sold, and one behavior you absolutely cannot tolerate in a cofounder.",
};

function responseFor(content: string): string {
  const normalized = content.toLowerCase();
  return normalized.includes("technical") ||
    normalized.includes("engineer") ||
    normalized.includes("build")
    ? RESPONSE_BY_THEME.technical
    : normalized.includes("commercial") ||
        normalized.includes("sales") ||
        normalized.includes("business")
      ? RESPONSE_BY_THEME.commercial
      : normalized.includes("problem together") || normalized.includes("explore")
        ? RESPONSE_BY_THEME.explore
      : RESPONSE_BY_THEME.default;
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
    const response = responseFor(content);
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
