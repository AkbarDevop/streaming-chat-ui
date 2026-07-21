import { validateUserContent } from "./codec";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type {
  ChatProtocolClient,
  ProtocolEvent,
  ProtocolState,
} from "./types";

interface DemoEngineerBrief {
  request?: string;
  proof?: string;
  availability?: string;
}

const PROOF_PATTERN =
  /github\.com|gitlab\.com|https?:\/\/|\b(i|we)\s+(built|shipped|merged|maintain|created|launched|contributed)\b|\b(repo|repository|project|pull request|\bpr\b)\b/i;
const AVAILABILITY_PATTERN =
  /\b\d+\s*(hours?|hrs?|days?)\b|this (week|weekend|month)|today|tomorrow|nights?|weekends?|part[\s-]?time|full[\s-]?time|easy|medium|hard|stretch/i;

function cleanAnswer(value: string, maxLength = 220): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function buildDemoBrief(answers: string[]): DemoEngineerBrief {
  const brief: DemoEngineerBrief = {};

  for (const rawAnswer of answers) {
    const answer = cleanAnswer(rawAnswer);
    const hasProof = PROOF_PATTERN.test(answer);
    const hasAvailability = AVAILABILITY_PATTERN.test(answer);

    if (hasProof && !brief.proof) brief.proof = answer;
    if (hasAvailability && !brief.availability) brief.availability = answer;
    if (!brief.request && (!hasProof || answer.length > 45)) brief.request = answer;
  }

  return brief;
}

function selectMatch(answers: string[]): string {
  const signal = answers.join(" ").toLowerCase();

  if (/rust|parser|compiler|formatter/.test(signal)) return "ruff-9127";
  if (/python|pydantic|validation|ai agent|machine learning/.test(signal)) return "pydantic-10422";
  if (/\bgo\b|golang|infrastructure|backend|distributed|worker/.test(signal)) return "temporal-1732";
  if (/react|frontend|\bui\b|state management/.test(signal)) return "plane-6234";
  return "cal-16841";
}

export function createDemoResponse(answers: string[]): string {
  const brief = buildDemoBrief(answers);

  if (!brief.request) {
    return "What kind of work do you want to ship: a stack, problem area, repository, or simply the time you have?";
  }

  if (!brief.proof && !brief.availability) {
    return "Good. I won’t make you browse a feed. Give me one proof signal—a GitHub profile, repository, or something relevant you shipped—and roughly how much time you have. I’ll rank the open work privately.";
  }

  if (!brief.proof) {
    return `I’ve got the time constraint: ${brief.availability} One last signal before I search—paste your GitHub profile or tell me the strongest relevant thing you have shipped.`;
  }

  if (!brief.availability) {
    return "That gives me enough proof to avoid résumé-keyword matching. How much time do you actually have this week, and do you want a safe contribution or a harder stretch?";
  }

  const matchId = selectMatch(answers);
  return `I found one ticket I would actually put in front of you.\n\n[[ticket:${matchId}]]\n\nI ranked it above the rest because the scope, maintainer behavior, and your available time line up—not just the language label.`;
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

  constructor(private readonly onState: (state: ProtocolState) => void) {}

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
    const answers = this.state.localTurns.map((turn) => turn.userContent);
    const response = createDemoResponse(answers);
    const chunks = chunkText(response, 11);

    let delay = 760;
    for (const chunk of chunks) {
      this.schedule(() => {
        this.apply({
          type: "SERVER_MESSAGE",
          message: { type: "AssistantDelta", content: chunk },
        });
      }, delay);
      delay += 30;
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
