import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  GitBranch,
  GitPullRequest,
  LockKeyhole,
  Play,
  Radio,
  RotateCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type ChatConfiguration,
  useChatProtocol,
} from "./hooks/useChatProtocol";
import { countUnicodeScalars } from "./protocol/codec";
import type { LocalTurn, ProtocolState } from "./protocol/types";

const OPENAI_KEY_SESSION_KEY = "ticket.run.openai-key";

const STARTING_PROMPTS = [
  "Find me a TypeScript ticket I can ship this weekend.",
  "I want backend infrastructure work with real maintainers.",
  "Match me with a paid Python open-source issue.",
];

const MATCH_STAGES = [
  { title: "Work signal", detail: "What you want to ship" },
  { title: "Proof + time", detail: "What you can credibly own" },
  { title: "One match", detail: "A ticket worth starting" },
];

interface TicketMatch {
  id: string;
  repo: string;
  issue: number;
  title: string;
  language: string;
  bounty: string;
  fit: number;
  estimate: string;
  branch: string;
  reason: string[];
  risk: string;
}

const TICKET_MATCHES: Record<string, TicketMatch> = {
  "cal-16841": {
    id: "cal-16841",
    repo: "calcom/cal.com",
    issue: 16841,
    title: "Timezone-aware recurring availability overrides",
    language: "TypeScript",
    bounty: "$1,200",
    fit: 96,
    estimate: "6–9h",
    branch: "feat/recurring-timezones",
    reason: [
      "Your public work includes date-heavy TypeScript",
      "The patch touches scheduling and Prisma boundaries you have shipped before",
      "Maintainers usually review a focused first patch within one day",
    ],
    risk: "DST fixtures are incomplete. Establish the expected edge behavior before implementation.",
  },
  "ruff-9127": {
    id: "ruff-9127",
    repo: "astral-sh/ruff",
    issue: 9127,
    title: "Preserve formatter comments around nested match guards",
    language: "Rust",
    bounty: "$850",
    fit: 91,
    estimate: "8–12h",
    branch: "fix/match-guard-comments",
    reason: [
      "Your parser work maps to this formatter boundary",
      "The issue has a maintainer-confirmed reproduction",
      "Your available block is large enough for the fixture work",
    ],
    risk: "Comment ownership crosses two AST nodes, so expect one maintainer design check.",
  },
  "pydantic-10422": {
    id: "pydantic-10422",
    repo: "pydantic/pydantic",
    issue: 10422,
    title: "Expose validation trace for discriminated unions",
    language: "Python",
    bounty: "$640",
    fit: 88,
    estimate: "4–6h",
    branch: "feat/union-validation-trace",
    reason: [
      "Your API tooling work includes structured error surfaces",
      "The issue fits a single focused work session",
      "Acceptance criteria are complete and maintainer-confirmed",
    ],
    risk: "Get approval on the public trace shape before writing the implementation.",
  },
  "temporal-1732": {
    id: "temporal-1732",
    repo: "temporalio/sdk-go",
    issue: 1732,
    title: "Worker health signal for sticky queue starvation",
    language: "Go",
    bounty: "$1,500",
    fit: 86,
    estimate: "10–14h",
    branch: "feat/sticky-queue-health",
    reason: [
      "Your distributed worker work maps to the queue model",
      "You have production observability proof",
      "The maintainer has already narrowed the diagnostic surface",
    ],
    risk: "Validate the deterministic test harness before changing worker code.",
  },
  "plane-6234": {
    id: "plane-6234",
    repo: "makeplane/plane",
    issue: 6234,
    title: "Bulk move cycles without losing issue ordering",
    language: "TypeScript / React",
    bounty: "$420",
    fit: 82,
    estimate: "3–5h",
    branch: "fix/stable-cycle-move",
    reason: [
      "Your React state work is directly relevant",
      "The patch is isolated to one product surface",
      "A maintainer supplied the failing reproduction",
    ],
    risk: "Ordering exists in both client and API responses. Keep the first patch client-side.",
  },
};

interface DisplayMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  status?: LocalTurn["status"];
  errorCode?: string;
}

function createInitialConfiguration(): ChatConfiguration {
  const environmentApiKey = import.meta.env.VITE_OPENAI_API_KEY?.trim() ?? "";
  let sessionApiKey = "";

  try {
    sessionApiKey = window.sessionStorage.getItem(OPENAI_KEY_SESSION_KEY) ?? "";
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  const apiKey = sessionApiKey || environmentApiKey;
  return {
    mode: apiKey ? "openai" : "demo",
    apiKey,
  };
}

function connectionLabel(state: ProtocolState, mode: ChatConfiguration["mode"]): string {
  if (state.connection === "ready") return mode === "demo" ? "Demo agent" : "OpenAI agent";
  if (state.connection === "connecting") return "Booting agent";
  if (state.connection === "awaiting-history") return "Syncing thread";
  return "Offline";
}

function displayMessages(state: ProtocolState): DisplayMessage[] {
  const messages: DisplayMessage[] = state.history.map((item, index) => ({
    key: `history-${index}`,
    role: item.role,
    content: item.content,
  }));

  for (const turn of state.localTurns) {
    messages.push({
      key: `local-${turn.sequence}-user`,
      role: "user",
      content: turn.userContent,
    });
    messages.push({
      key: `local-${turn.sequence}-assistant`,
      role: "assistant",
      content: turn.assistantContent,
      status: turn.status,
      errorCode: turn.errorCode,
    });
  }

  return messages;
}

function matchIdFromContent(content: string): string | null {
  return content.match(/\[\[ticket:([a-z0-9-]+)\]\]/i)?.[1] ?? null;
}

function visibleAssistantContent(content: string): string {
  return content
    .replace(/\[\[ticket:[a-z0-9-]+\]\]/gi, "")
    .replace(/\[\[[^\]]*$/g, "")
    .trim();
}

function MessageStatus({ message }: { message: DisplayMessage }) {
  if (message.status === "incomplete") {
    return <span className="message-note">Response ended before completion</span>;
  }
  if (message.status === "failed") {
    return (
      <span className="message-note message-note--error">
        Agent stopped{message.errorCode ? ` · ${message.errorCode}` : ""}
      </span>
    );
  }
  if (message.status === "unresolved") {
    return (
      <span className="message-note message-note--error">
        Connection lost · outcome uncertain
      </span>
    );
  }
  return null;
}

function MatchResult({
  match,
  claimed,
  onClaim,
}: {
  match: TicketMatch;
  claimed: boolean;
  onClaim: () => void;
}) {
  return (
    <section className={`match-result${claimed ? " match-result--claimed" : ""}`}>
      <div className="match-result__signal">
        <span><Sparkles size={14} aria-hidden="true" /> one match found</span>
        <strong>{match.fit}% fit</strong>
      </div>

      <div className="match-result__title">
        <div>
          <span>{match.repo} / #{match.issue}</span>
          <h3>{match.title}</h3>
        </div>
        <div className="match-score" aria-label={`${match.fit}% match score`}>
          <strong>{match.fit}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="match-meta">
        <span><Terminal size={13} />{match.language}</span>
        <span><Clock3 size={13} />{match.estimate}</span>
        <span><ShieldCheck size={13} />{match.bounty} verified</span>
      </div>

      <div className="match-reasons">
        <span>why the agent picked this</span>
        <ol>
          {match.reason.map((reason) => <li key={reason}>{reason}</li>)}
        </ol>
      </div>

      <div className="match-risk">
        <span>preflight</span>
        <p>{match.risk}</p>
      </div>

      <div className="match-result__footer">
        <code><GitBranch size={13} />{match.branch}</code>
        <button type="button" onClick={onClaim}>
          {claimed ? <><Check size={15} /> Run started</> : <><GitPullRequest size={15} /> Start this ticket</>}
        </button>
      </div>

      {claimed ? (
        <div className="run-receipt" aria-live="polite">
          <i /> run initialized · scope check and branch instructions ready
        </div>
      ) : null}
    </section>
  );
}

export default function App() {
  const [configuration, setConfiguration] = useState(createInitialConfiguration);
  const [draftConfiguration, setDraftConfiguration] = useState(configuration);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [content, setContent] = useState("");
  const [claimedMatchId, setClaimedMatchId] = useState<string | null>(null);
  const { state, sendMessage, reconnect } = useChatProtocol(configuration);
  const messages = useMemo(() => displayMessages(state), [state]);
  const conversationRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scalarCount = countUnicodeScalars(content);
  const isReady = state.connection === "ready";
  const isActive = state.activeTurn !== null;
  const canSend = isReady && !isActive && content.trim().length > 0 && scalarCount <= 32_000;
  const userAnswerCount =
    state.history.filter((item) => item.role === "user").length + state.localTurns.length;
  const currentMatchId = messages.reduce<string | null>(
    (latest, message) => matchIdFromContent(message.content) ?? latest,
    null,
  );
  const stageIndex = currentMatchId ? 2 : Math.min(userAnswerCount, 1);

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;
    const frame = window.requestAnimationFrame(() => {
      conversation.scrollTop = conversation.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, claimedMatchId]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [settingsOpen]);

  const submitMessage = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    try {
      sendMessage(trimmed);
      setContent("");
      setComposerError("");
      window.requestAnimationFrame(() => textareaRef.current?.focus());
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Could not send message");
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (canSend) submitMessage(content);
  };

  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) submitMessage(content);
    }
  };

  const openSettings = () => {
    setDraftConfiguration(configuration);
    setSettingsError("");
    setSettingsOpen(true);
  };

  const applySettings = (event: FormEvent) => {
    event.preventDefault();
    const apiKey = draftConfiguration.apiKey.trim();
    if (draftConfiguration.mode === "openai") {
      if (!apiKey) {
        setSettingsError("Enter an OpenAI API key.");
        return;
      }
      try {
        window.sessionStorage.setItem(OPENAI_KEY_SESSION_KEY, apiKey);
      } catch {
        // The in-memory key still supports this page load.
      }
    } else {
      try {
        window.sessionStorage.removeItem(OPENAI_KEY_SESSION_KEY);
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }
    }

    const next = { ...draftConfiguration, apiKey };
    const unchanged = JSON.stringify(next) === JSON.stringify(configuration);
    setSettingsOpen(false);
    setSettingsError("");
    setClaimedMatchId(null);
    if (unchanged) reconnect();
    else setConfiguration(next);
  };

  return (
    <div className="app-shell">
      <aside className="brief-rail">
        <a className="brand-lockup" href="#match" aria-label="ticket.run home">
          <span className="brand-prompt" aria-hidden="true">&gt;_</span>
          <strong>ticket.run</strong>
          <span>alpha</span>
        </a>

        <div className="rail-thesis">
          <span>private match agent</span>
          <h2>One ticket.<br />Not another feed.</h2>
        </div>

        <ol className="match-stages" aria-label="Match progress">
          {MATCH_STAGES.map((stage, index) => (
            <li
              key={stage.title}
              className={index < stageIndex ? "complete" : index === stageIndex ? "active" : ""}
            >
              <span className="stage-index">
                {index < stageIndex ? <Check size={12} aria-label="Complete" /> : `0${index + 1}`}
              </span>
              <div>
                <strong>{stage.title}</strong>
                <span>{stage.detail}</span>
              </div>
            </li>
          ))}
        </ol>

        <div className="rail-footer">
          <LockKeyhole size={15} aria-hidden="true" />
          <div>
            <strong>No ticket backend</strong>
            <span>OpenAI ranks the fake catalog directly in your browser.</span>
          </div>
        </div>
      </aside>

      <main className="workspace" id="match">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">engineer ↔ open ticket</span>
            <h1>{MATCH_STAGES[stageIndex].title}</h1>
          </div>
          <div className="header-actions">
            <span className={`connection-status connection-status--${state.connection}`}>
              <i />{connectionLabel(state, configuration.mode)}
            </span>
            {state.connection === "disconnected" ? (
              <button className="text-button" type="button" onClick={reconnect}>
                <RotateCw size={14} /> Reconnect
              </button>
            ) : null}
            <button className="icon-button" type="button" onClick={openSettings} aria-label="Open agent settings">
              <Settings2 size={18} />
            </button>
          </div>
        </header>

        {state.lastError ? (
          <div className="error-banner" role="alert">
            <CircleAlert size={16} />
            <span><strong>{state.lastError.code}</strong>{state.lastError.message}</span>
          </div>
        ) : null}

        <section ref={conversationRef} className="conversation" aria-label="Ticket matching conversation">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="agent-glyph" aria-hidden="true"><i /><span>&gt;_</span></div>
              <span className="empty-kicker">private ticket matcher</span>
              <h2>Tell me what you want to ship.</h2>
              <p>
                I’ll use your proof, available time, and maintainer behavior to return one open ticket worth starting.
              </p>
              <div className="prompt-list" aria-label="Starting prompts">
                {STARTING_PROMPTS.map((prompt, index) => (
                  <button key={prompt} type="button" onClick={() => submitMessage(prompt)} disabled={!isReady || isActive}>
                    <span>0{index + 1}</span>
                    {prompt}
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message) => {
                const matchId = matchIdFromContent(message.content);
                const match = matchId ? TICKET_MATCHES[matchId] : null;
                const visibleContent = message.role === "assistant"
                  ? visibleAssistantContent(message.content)
                  : message.content;

                return (
                  <article className={`message message--${message.role}`} key={message.key}>
                    <div className="message-label">
                      <span>{message.role === "assistant" ? "Match agent" : "You"}</span>
                      {message.role === "assistant" && message.status === "completed" ? <Check size={12} /> : null}
                    </div>
                    {message.role === "assistant" && message.status === "active" && !visibleContent ? (
                      <div className="thinking" aria-label="Match agent is thinking">
                        <i /><i /><i /><span>Searching quietly</span>
                      </div>
                    ) : (
                      <div className="message-content">
                        {visibleContent.split("\n").map((line, index) =>
                          line ? <p key={`${message.key}-${index}`}>{line}</p> : <br key={`${message.key}-${index}`} />,
                        )}
                        {message.role === "assistant" && message.status === "active" ? <span className="stream-cursor" /> : null}
                      </div>
                    )}
                    {match ? (
                      <MatchResult
                        match={match}
                        claimed={claimedMatchId === match.id}
                        onClaim={() => setClaimedMatchId(match.id)}
                      />
                    ) : null}
                    <MessageStatus message={message} />
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={onSubmit}>
            <span className="composer-prompt" aria-hidden="true">&gt;</span>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={isReady ? "Describe the work, proof, or time you have…" : "Waiting for the match agent…"}
              rows={1}
              disabled={!isReady || isActive}
              aria-label="Message"
            />
            <button className="send-button" type="submit" disabled={!canSend} aria-label="Send message">
              <ArrowUp size={18} />
            </button>
          </form>
          <div className="composer-meta">
            <span>{composerError || (isActive ? "One turn at a time · matching may take a moment" : "Enter to send · Shift + Enter for newline")}</span>
            <span className={scalarCount > 32_000 ? "limit-exceeded" : ""}>{scalarCount.toLocaleString()} / 32,000</span>
          </div>
        </div>
      </main>

      {settingsOpen ? (
        <>
          <button className="drawer-scrim" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings" />
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="drawer-header">
              <div><span className="eyebrow">match harness</span><h2 id="settings-title">Agent connection</h2></div>
              <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18} /></button>
            </div>
            <form onSubmit={applySettings}>
              <fieldset className="mode-picker">
                <legend>Agent</legend>
                <button type="button" className={draftConfiguration.mode === "demo" ? "selected" : ""} onClick={() => setDraftConfiguration((current) => ({ ...current, mode: "demo" }))}>
                  <Play size={16} /><span><strong>Local demo</strong><small>No API key needed</small></span>
                </button>
                <button type="button" className={draftConfiguration.mode === "openai" ? "selected" : ""} onClick={() => setDraftConfiguration((current) => ({ ...current, mode: "openai" }))}>
                  <Radio size={16} /><span><strong>OpenAI</strong><small>Direct browser call</small></span>
                </button>
              </fieldset>
              {draftConfiguration.mode === "openai" ? (
                <div className="live-fields">
                  <label className="field">
                    <span>OpenAI API key</span>
                    <input
                      type="password"
                      value={draftConfiguration.apiKey}
                      onChange={(event) => setDraftConfiguration((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="sk-…"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                    />
                    <small>Kept only for this browser tab</small>
                  </label>
                  <div className="auth-warning">
                    <CircleAlert size={15} />
                    <p><strong>MVP only.</strong> A browser-held API key can be inspected. Do not embed a production key in a public build.</p>
                  </div>
                </div>
              ) : (
                <p className="demo-note">Demo mode simulates matching locally. Nothing you type leaves this browser.</p>
              )}
              <div className="harness-note"><LockKeyhole size={15} /><p><strong>Fake-ticket MVP.</strong> The model can only select from the five fixture tickets included in its system prompt.</p></div>
              {settingsError ? <p className="form-error" role="alert">{settingsError}</p> : null}
              <button className="apply-button" type="submit">Start fresh session <ChevronRight size={17} /></button>
            </form>
          </aside>
        </>
      ) : null}
    </div>
  );
}
