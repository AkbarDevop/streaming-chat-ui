import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  RotateCw,
  Settings2,
  Wifi,
  WifiOff,
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
import {
  DEFAULT_FRAMEWORKS,
  type Frameworks,
  type LocalTurn,
  type ProtocolState,
} from "./protocol/types";

const FRAMEWORK_OPTIONS = {
  coaching_cycle: [
    ["impact-cycle", "Impact Cycle"],
    ["student-centered-coaching", "Student-Centered Coaching"],
    ["peer-coaching", "Peer Coaching"],
  ],
  coaching_conversation: [
    ["cognitive-coaching", "Cognitive Coaching"],
    ["grow", "GROW"],
  ],
  teaching_framework: [
    ["class", "CLASS"],
    ["danielson", "Danielson"],
    ["udl", "UDL"],
  ],
  continuous_improvement: [
    ["plc", "PLC"],
    ["pdsa", "PDSA"],
  ],
} as const;

const FRAMEWORK_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(FRAMEWORK_OPTIONS).flat(),
);

const EXAMPLE_PROMPTS = [
  "What patterns can you identify?",
  "Help me unpack a classroom challenge.",
  "What should I try next lesson?",
];

interface DisplayMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  status?: LocalTurn["status"];
  errorCode?: string;
}

function createInitialConfiguration(): ChatConfiguration {
  const url = import.meta.env.VITE_CHAT_WS_URL?.trim() ?? "";
  return {
    mode: url ? "live" : "demo",
    url,
    frameworks: DEFAULT_FRAMEWORKS,
  };
}

function connectionLabel(state: ProtocolState, mode: ChatConfiguration["mode"]) {
  if (state.connection === "ready") return mode === "demo" ? "Demo ready" : "Connected";
  if (state.connection === "connecting") return "Connecting";
  if (state.connection === "awaiting-history") return "Loading history";
  return "Disconnected";
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

function MessageStatus({ message }: { message: DisplayMessage }) {
  if (message.status === "incomplete") {
    return <span className="message-note">Response ended before completion</span>;
  }
  if (message.status === "failed") {
    return (
      <span className="message-note message-note--error">
        Response failed{message.errorCode ? ` · ${message.errorCode}` : ""}
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

function FrameworkSelect<K extends keyof Frameworks>({
  field,
  label,
  value,
  onChange,
}: {
  field: K;
  label: string;
  value: Frameworks[K];
  onChange: (field: K, value: Frameworks[K]) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(field, event.target.value as Frameworks[K])}
      >
        {FRAMEWORK_OPTIONS[field].map(([optionValue, optionLabel]) => (
          <option value={optionValue} key={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function App() {
  const [configuration, setConfiguration] = useState(createInitialConfiguration);
  const [draftConfiguration, setDraftConfiguration] = useState(configuration);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [content, setContent] = useState("");
  const { state, sendMessage, reconnect } = useChatProtocol(configuration);
  const messages = useMemo(() => displayMessages(state), [state]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scalarCount = countUnicodeScalars(content);
  const isReady = state.connection === "ready";
  const isActive = state.activeTurn !== null;
  const canSend = isReady && !isActive && content.trim().length > 0 && scalarCount <= 32_000;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

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
    const url = draftConfiguration.url.trim();
    if (draftConfiguration.mode === "live" && !/^wss?:\/\//i.test(url)) {
      setSettingsError("Enter a WebSocket URL beginning with ws:// or wss://.");
      return;
    }

    const next = { ...draftConfiguration, url };
    const unchanged = JSON.stringify(next) === JSON.stringify(configuration);
    setSettingsOpen(false);
    setSettingsError("");
    if (unchanged) reconnect();
    else setConfiguration(next);
  };

  const updateFramework = <K extends keyof Frameworks>(
    field: K,
    value: Frameworks[K],
  ) => {
    setDraftConfiguration((current) => ({
      ...current,
      frameworks: { ...current.frameworks, [field]: value },
    }));
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-lockup">
          <span className="brand-index">01</span>
          <div>
            <strong>Fieldnote</strong>
            <span>Coaching room</span>
          </div>
        </div>

        <div className="rail-section">
          <span className="eyebrow">Active lenses</span>
          <ol className="lens-list">
            {Object.values(configuration.frameworks).map((framework, index) => (
              <li key={framework}>
                <span>0{index + 1}</span>
                {FRAMEWORK_LABELS[framework]}
              </li>
            ))}
          </ol>
        </div>

        <div className="rail-footer">
          <div className={`connection-dot connection-dot--${state.connection}`} />
          <div>
            <span>Session</span>
            <strong>{connectionLabel(state, configuration.mode)}</strong>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">Reflection workspace</span>
            <h1>New conversation</h1>
          </div>
          <div className="header-actions">
            {state.connection === "disconnected" ? (
              <button className="text-button" type="button" onClick={reconnect}>
                <RotateCw size={15} aria-hidden="true" />
                Reconnect
              </button>
            ) : null}
            <button
              className="icon-button"
              type="button"
              onClick={openSettings}
              aria-label="Open connection settings"
              title="Connection settings"
            >
              <Settings2 size={19} aria-hidden="true" />
            </button>
          </div>
        </header>

        {state.lastError ? (
          <div className="error-banner" role="alert">
            <CircleAlert size={17} aria-hidden="true" />
            <span>
              <strong>{state.lastError.code}</strong>
              {state.lastError.message}
            </span>
          </div>
        ) : null}

        <section className="conversation" aria-label="Conversation">
          {messages.length === 0 ? (
            <div className="empty-state">
              <span className="empty-kicker">A quiet place to think clearly</span>
              <h2>Start with what happened.</h2>
              <p>
                Share a moment from your practice. Fieldnote will help you find the
                pattern and choose a useful next move.
              </p>
              <div className="prompt-list" aria-label="Example prompts">
                {EXAMPLE_PROMPTS.map((prompt, index) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submitMessage(prompt)}
                    disabled={!isReady || isActive}
                  >
                    <span>0{index + 1}</span>
                    {prompt}
                    <ChevronRight size={17} aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list" aria-live="polite">
              {messages.map((message) => (
                <article
                  className={`message message--${message.role}`}
                  key={message.key}
                >
                  <div className="message-label">
                    <span>{message.role === "assistant" ? "Fieldnote" : "You"}</span>
                    {message.role === "assistant" && message.status === "completed" ? (
                      <Check size={13} aria-label="Completed" />
                    ) : null}
                  </div>
                  {message.role === "assistant" && message.status === "active" && !message.content ? (
                    <div className="thinking" aria-label="Assistant is thinking">
                      <i />
                      <i />
                      <i />
                      <span>Thinking</span>
                    </div>
                  ) : (
                    <div className="message-content">
                      {message.content.split("\n").map((line, index) =>
                        line ? <p key={`${message.key}-${index}`}>{line}</p> : <br key={`${message.key}-${index}`} />,
                      )}
                      {message.role === "assistant" && message.status === "active" ? (
                        <span className="stream-cursor" aria-hidden="true" />
                      ) : null}
                    </div>
                  )}
                  <MessageStatus message={message} />
                </article>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={isReady ? "Describe what you noticed…" : "Waiting for the session…"}
              rows={1}
              disabled={!isReady || isActive}
              aria-label="Message"
            />
            <button
              className="send-button"
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              title="Send message"
            >
              <ArrowUp size={19} aria-hidden="true" />
            </button>
          </form>
          <div className="composer-meta">
            <span>{composerError || (isActive ? "One turn at a time" : "Enter to send · Shift + Enter for a new line")}</span>
            <span className={scalarCount > 32_000 ? "limit-exceeded" : ""}>
              {scalarCount.toLocaleString()} / 32,000
            </span>
          </div>
        </div>
      </main>

      {settingsOpen ? (
        <>
          <button
            className="drawer-scrim"
            type="button"
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
          />
          <aside className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="drawer-header">
              <div>
                <span className="eyebrow">Session setup</span>
                <h2 id="settings-title">Connection & lenses</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
                title="Close settings"
              >
                <X size={19} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={applySettings}>
              <fieldset className="mode-picker">
                <legend>Transport</legend>
                <button
                  type="button"
                  className={draftConfiguration.mode === "demo" ? "selected" : ""}
                  onClick={() => setDraftConfiguration((current) => ({ ...current, mode: "demo" }))}
                >
                  <Wifi size={17} aria-hidden="true" />
                  <span><strong>Demo</strong><small>Built-in stream</small></span>
                </button>
                <button
                  type="button"
                  className={draftConfiguration.mode === "live" ? "selected" : ""}
                  onClick={() => setDraftConfiguration((current) => ({ ...current, mode: "live" }))}
                >
                  <WifiOff size={17} aria-hidden="true" />
                  <span><strong>Live</strong><small>Your WebSocket</small></span>
                </button>
              </fieldset>

              {draftConfiguration.mode === "live" ? (
                <label className="field">
                  <span>WebSocket URL</span>
                  <input
                    type="url"
                    value={draftConfiguration.url}
                    onChange={(event) => setDraftConfiguration((current) => ({ ...current, url: event.target.value }))}
                    placeholder="wss://api.example.com/session-chat"
                    autoFocus
                  />
                </label>
              ) : (
                <p className="demo-note">
                  Demo mode mirrors the protocol timing locally. No messages leave this browser.
                </p>
              )}

              <div className="field-divider"><span>Frameworks</span></div>
              <FrameworkSelect
                field="coaching_cycle"
                label="Coaching cycle"
                value={draftConfiguration.frameworks.coaching_cycle}
                onChange={updateFramework}
              />
              <FrameworkSelect
                field="coaching_conversation"
                label="Coaching conversation"
                value={draftConfiguration.frameworks.coaching_conversation}
                onChange={updateFramework}
              />
              <FrameworkSelect
                field="teaching_framework"
                label="Teaching framework"
                value={draftConfiguration.frameworks.teaching_framework}
                onChange={updateFramework}
              />
              <FrameworkSelect
                field="continuous_improvement"
                label="Continuous improvement"
                value={draftConfiguration.frameworks.continuous_improvement}
                onChange={updateFramework}
              />

              {settingsError ? <p className="form-error" role="alert">{settingsError}</p> : null}
              <button className="apply-button" type="submit">
                Start new session
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </form>
          </aside>
        </>
      ) : null}
    </div>
  );
}
