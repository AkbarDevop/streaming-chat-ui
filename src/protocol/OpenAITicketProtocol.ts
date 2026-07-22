import { validateUserContent } from "./codec";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type {
  ChatProtocolClient,
  ProtocolEvent,
  ProtocolState,
} from "./types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-5.6";

export const TICKET_MATCHER_INSTRUCTIONS = `
You are ticket.run, a concise AI matchmaker between engineers and open tickets.
This is an MVP demo. Every ticket and every repository signal below is fictional fixture data. Never claim that you browsed GitHub, contacted maintainers, or verified live repository state.

Your job:
1. Collect three signals across the full conversation: desired work, proof of ability, and available time.
2. A bare GitHub-style handle such as "akbardevop" counts as proof. Treat it as a demo profile signal without claiming you inspected it.
3. Never ask for a signal the user already supplied. Never repeat the same question.
4. Ask for at most one missing signal per reply.
5. As soon as all three signals exist, select exactly one ticket from the fixture catalog. Include its exact marker on a separate line, for example [[ticket:cal-16841]]. Never invent another marker.
6. Keep replies under 90 words. Be direct and specific.

Fixture ticket catalog:
- [[ticket:cal-16841]] | calcom/cal.com #16841 | TypeScript | timezone-aware recurring availability overrides | 6-9 hours | $1,200 demo bounty | best for TypeScript, scheduling, Prisma, or date-heavy product work.
- [[ticket:plane-6234]] | makeplane/plane #6234 | TypeScript/React | bulk move cycles without losing issue ordering | 3-5 hours | $420 demo bounty | best for React, frontend state, UI, or shorter weekend work.
- [[ticket:pydantic-10422]] | pydantic/pydantic #10422 | Python | expose validation trace for discriminated unions | 4-6 hours | $640 demo bounty | best for Python, APIs, validation, agents, or structured errors.
- [[ticket:temporal-1732]] | temporalio/sdk-go #1732 | Go | worker health signal for sticky queue starvation | 10-14 hours | $1,500 demo bounty | best for backend infrastructure, workers, distributed systems, or observability.
- [[ticket:ruff-9127]] | astral-sh/ruff #9127 | Rust | preserve formatter comments around nested match guards | 8-12 hours | $850 demo bounty | best for Rust, parsers, compilers, formatters, or AST work.

When you return a match, briefly say why its stack and scope fit the supplied signals. The UI renders the detailed ticket card from the marker.
`.trim();

interface OpenAIOutputPart {
  type?: string;
  text?: string;
}

interface OpenAIOutputItem {
  type?: string;
  content?: OpenAIOutputPart[];
}

interface OpenAIResponseBody {
  output_text?: string;
  output?: OpenAIOutputItem[];
  error?: { message?: string };
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function readOpenAIResponseText(body: OpenAIResponseBody): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  return (body.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

export class OpenAITicketProtocol implements ChatProtocolClient {
  private state = createInitialProtocolState();
  private generation = 0;
  private request: AbortController | null = null;

  constructor(
    private readonly apiKey: string,
    private readonly onState: (state: ProtocolState) => void,
    private readonly fetcher: Fetcher = window.fetch.bind(window),
  ) {}

  connect(): void {
    this.disconnect();
    this.generation += 1;
    this.apply({ type: "CONNECT_STARTED" });
    this.apply({ type: "SOCKET_OPENED" });
    this.apply({
      type: "SERVER_MESSAGE",
      message: { type: "History", items: [] },
    });
  }

  sendUserMessage(content: string): void {
    validateUserContent(content);
    if (this.state.connection !== "ready") {
      throw new Error("OpenAI client is not ready");
    }
    if (this.state.activeTurn) {
      throw new Error("A turn is already active");
    }

    this.apply({ type: "USER_MESSAGE_SENT", content });
    const generation = this.generation;
    const controller = new AbortController();
    this.request = controller;
    void this.completeTurn(generation, controller);
  }

  disconnect(): void {
    this.generation += 1;
    this.request?.abort();
    this.request = null;
    if (this.state.connection !== "disconnected") {
      this.apply({ type: "SOCKET_CLOSED" });
    }
  }

  getState(): ProtocolState {
    return this.state;
  }

  private async completeTurn(
    generation: number,
    controller: AbortController,
  ): Promise<void> {
    const input = this.state.localTurns.flatMap((turn) => {
      const messages: Array<{
        role: "user" | "assistant";
        content: string;
      }> = [{ role: "user", content: turn.userContent }];
      if (turn.assistantContent) {
        messages.push({ role: "assistant", content: turn.assistantContent });
      }
      return messages;
    });

    try {
      const response = await this.fetcher(OPENAI_RESPONSES_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          instructions: TICKET_MATCHER_INSTRUCTIONS,
          input,
          max_output_tokens: 300,
          store: false,
        }),
        signal: controller.signal,
      });
      const body = (await response.json()) as OpenAIResponseBody;

      if (!response.ok) {
        throw new Error(body.error?.message || `OpenAI request failed (${response.status})`);
      }

      const content = readOpenAIResponseText(body);
      if (!content) throw new Error("OpenAI returned no text");
      if (!this.isCurrent(generation, controller)) return;

      this.apply({
        type: "SERVER_MESSAGE",
        message: { type: "AssistantDelta", content },
      });
      this.apply({
        type: "SERVER_MESSAGE",
        message: {
          type: "AssistantDone",
          content,
          finish_reason: "completed",
        },
      });
    } catch (error) {
      if (!this.isCurrent(generation, controller) || controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "OpenAI request failed";
      this.apply({
        type: "SERVER_MESSAGE",
        message: { type: "Error", code: "openai_request_failed", message },
      });
    } finally {
      if (this.request === controller) this.request = null;
    }
  }

  private isCurrent(generation: number, controller: AbortController): boolean {
    return this.generation === generation && this.request === controller;
  }

  private apply(event: ProtocolEvent): void {
    this.state = protocolReducer(this.state, event);
    this.onState(this.state);
  }
}
