import { validateUserContent } from "./codec";
import { createInitialProtocolState, protocolReducer } from "./reducer";
import type {
  ChatProtocolClient,
  ProtocolEvent,
  ProtocolState,
} from "./types";

type FounderDirection =
  | "technical-seeks-commercial"
  | "commercial-seeks-technical"
  | "explore-together";

interface DemoFounderProfile {
  direction?: FounderDirection;
  domains?: string;
  commitment?: string;
  proof: string[];
  dealbreaker?: string;
}

const COMMITMENT_PATTERN =
  /full[\s-]?time|part[\s-]?time|\b\d+\s*(hours?|hrs?)\b|nights?|weekends?|exploring/i;
const PROOF_PATTERN =
  /\b(i|we)\s+(built|shipped|launched|sold|founded|created|grew)\b|https?:\/\/|\b(revenue|users?|customers?|waitlist|mrr|arr)\b/i;
const DEALBREAKER_PATTERN =
  /can('|’)t tolerate|cannot tolerate|deal[\s-]?breaker|dishonest|dishonesty|poor communication|doesn('|’)t communicate|ghost|ego|unreliable|lazy|no accountability|lack of accountability|low commitment|not committed|slow execution|integrity/i;

function cleanAnswer(value: string, maxLength = 180): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}…` : cleaned;
}

function detectDirection(content: string): FounderDirection | undefined {
  const normalized = content.toLowerCase();

  if (
    normalized.includes("problem together") ||
    normalized.includes("idea together") ||
    normalized.includes("explore together") ||
    normalized.includes("right problem")
  ) {
    return "explore-together";
  }

  if (
    (normalized.includes("technical") || normalized.includes("engineer")) &&
    (normalized.includes("commercial") ||
      normalized.includes("business") ||
      normalized.includes("sales") ||
      normalized.includes("gtm") ||
      normalized.includes("go-to-market"))
  ) {
    return "technical-seeks-commercial";
  }

  if (
    (normalized.includes("traction") ||
      normalized.includes("commercial") ||
      normalized.includes("sales") ||
      normalized.includes("business")) &&
    (normalized.includes("build") ||
      normalized.includes("technical") ||
      normalized.includes("engineer"))
  ) {
    return "commercial-seeks-technical";
  }

  return undefined;
}

function buildDemoProfile(answers: string[]): DemoFounderProfile {
  const profile: DemoFounderProfile = { proof: [] };

  for (const rawAnswer of answers) {
    const answer = cleanAnswer(rawAnswer);
    const direction = detectDirection(answer);
    const isCommitment = COMMITMENT_PATTERN.test(answer);
    const isProof = PROOF_PATTERN.test(answer);
    const isDealbreaker = DEALBREAKER_PATTERN.test(answer);

    profile.direction ??= direction;
    if (isCommitment) profile.commitment = answer;
    if (isProof && !profile.proof.includes(answer)) profile.proof.push(answer);
    if (isDealbreaker) profile.dealbreaker = answer;

    if (
      !profile.domains &&
      !direction &&
      !isCommitment &&
      !isProof &&
      !isDealbreaker &&
      answer.length >= 3
    ) {
      profile.domains = answer;
    }
  }

  return profile;
}

function directionLabel(direction: FounderDirection): string {
  switch (direction) {
    case "technical-seeks-commercial":
      return "technical founder seeking a commercial counterpart";
    case "commercial-seeks-technical":
      return "commercial founder seeking a technical builder";
    case "explore-together":
      return "founder looking to discover the right problem with a complementary partner";
  }
}

function askForDomains(direction: FounderDirection): string {
  switch (direction) {
    case "technical-seeks-commercial":
      return "Strong start. You bring the technical side, so I’ll prioritize people who can own customer discovery, distribution, and the commercial story.\n\nWhich industries or problem spaces do you understand unusually well?";
    case "commercial-seeks-technical":
      return "Got it. You bring customer and commercial context, so I’ll look for someone who can turn that signal into product and make sound technical tradeoffs.\n\nWhich industries or problem spaces do you understand unusually well?";
    case "explore-together":
      return "That opens a different kind of search. I’ll look for someone who shares your pace and ambition but brings a different problem lens, so you can discover the right company together instead of forcing an idea too early.\n\nWhich domains do you understand unusually well, and what kind of problem would you still care about after two difficult years?";
  }
}

export function createDemoResponse(answers: string[]): string {
  const profile = buildDemoProfile(answers);
  const latestAnswer = cleanAnswer(answers.at(-1) ?? "");

  if (!profile.direction) {
    const context = profile.domains
      ? `I’ve got your terrain: ${profile.domains}. `
      : "";
    return `${context}What side can you own today: product and engineering, customers and distribution, or are you looking for someone to discover the right problem with?`;
  }

  if (!profile.domains) {
    return askForDomains(profile.direction);
  }

  if (!profile.commitment) {
    return `Good territory. I’ve added ${profile.domains} to your brief.\n\nWhat is your real commitment level right now: full-time, part-time, nights and weekends, or still exploring?`;
  }

  if (profile.proof.length === 0) {
    return `Got it: ${profile.commitment}. Commitment changes who I should put in front of you.\n\nWhat is the strongest thing you have built, shipped, sold, or grown so far?`;
  }

  if (!profile.dealbreaker) {
    const proofAcknowledgement = profile.proof.length > 1
      ? `That adds another proof point to your brief: ${latestAnswer}.`
      : `That is real execution evidence, not just a résumé claim: ${profile.proof[0]}.`;

    return `${proofAcknowledgement}\n\nOne final thing I can’t infer from projects: what is one behavior you absolutely cannot tolerate in a cofounder?`;
  }

  return `Your founder brief is ready.\n\nYou’re a ${directionLabel(profile.direction)}. Your domain is ${profile.domains}. Your commitment is “${profile.commitment}.” Your proof includes ${profile.proof.join("; ")}. Your non-negotiable is “${profile.dealbreaker}.”\n\nNext, I’d scan the pool for complementary founders, red-team the strongest pairings for commitment and working-style risk, and bring back one person worth meeting.`;
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
