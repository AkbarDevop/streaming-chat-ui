export type CoachingCycle =
  | "impact-cycle"
  | "student-centered-coaching"
  | "peer-coaching";

export type CoachingConversation = "cognitive-coaching" | "grow";
export type TeachingFramework = "class" | "danielson" | "udl";
export type ContinuousImprovement = "plc" | "pdsa";

export interface Frameworks {
  coaching_cycle: CoachingCycle;
  coaching_conversation: CoachingConversation;
  teaching_framework: TeachingFramework;
  continuous_improvement: ContinuousImprovement;
}

export const DEFAULT_FRAMEWORKS: Frameworks = {
  coaching_cycle: "impact-cycle",
  coaching_conversation: "grow",
  teaching_framework: "class",
  continuous_improvement: "plc",
};

export type ClientMessage =
  | { type: "Init"; frameworks: Frameworks }
  | { type: "UserMessage"; content: string };

export type OffsetDateTimeWire = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface HistoryItem {
  role: "user" | "assistant";
  content: string;
  created_at: OffsetDateTimeWire;
}

export type FinishReason = "completed" | "incomplete" | "failed" | null;

export type ServerMessage =
  | { type: "History"; items: HistoryItem[] }
  | { type: "AssistantDelta"; content: string }
  | {
      type: "AssistantDone";
      content: string;
      finish_reason: FinishReason;
    }
  | { type: "Error"; code: string; message: string };

export interface ActiveTurn {
  sequence: number;
  userContent: string;
  assistantBuffer: string;
  phase: "awaiting-response" | "streaming";
}

export interface CompletedTurn {
  userContent: string;
  content: string;
  finishReason: FinishReason;
  persisted: boolean;
}

export interface UnresolvedTurn {
  userContent: string;
  partialAssistantContent: string;
  reason: "connection-lost" | "protocol-error";
}

export interface LocalTurn {
  sequence: number;
  userContent: string;
  assistantContent: string;
  status: "active" | "completed" | "incomplete" | "failed" | "unresolved";
  finishReason?: FinishReason;
  errorCode?: string;
}

export interface ProtocolState {
  connection: "disconnected" | "connecting" | "awaiting-history" | "ready";
  history: HistoryItem[];
  localTurns: LocalTurn[];
  activeTurn: ActiveTurn | null;
  completedTurn: CompletedTurn | null;
  unresolvedTurn: UnresolvedTurn | null;
  lastError: Extract<ServerMessage, { type: "Error" }> | null;
  nextSequence: number;
}

export type ProtocolEvent =
  | { type: "CONNECT_STARTED" }
  | { type: "SOCKET_OPENED" }
  | { type: "USER_MESSAGE_SENT"; content: string }
  | { type: "SERVER_MESSAGE"; message: ServerMessage }
  | { type: "SOCKET_CLOSED" }
  | { type: "PROTOCOL_ERROR"; message: string };

export interface ChatProtocolClient {
  connect(): void;
  disconnect(): void;
  sendUserMessage(content: string): void;
  getState(): ProtocolState;
}
