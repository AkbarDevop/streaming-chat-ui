import {
  ArrowUp,
  Check,
  ChevronRight,
  CircleAlert,
  LockKeyhole,
  Play,
  Radio,
  RotateCw,
  Settings2,
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
  normalizeUsername,
  USERNAME_PATTERN,
  validateUsername,
} from "./protocol/connection";
import type { LocalTurn, ProtocolState } from "./protocol/types";

const USERNAME_STORAGE_KEY = "cofounder-match.username";

const STARTING_PATHS = [
  "I’m technical and need a commercial cofounder.",
  "I have traction and need someone who can build.",
  "I want to find the right problem together.",
];

const BRIEF_STAGES = [
  { title: "Founder profile", detail: "Skills, proof & commitment" },
  { title: "Build thesis", detail: "Problem, insight & ambition" },
  { title: "Match criteria", detail: "Gaps, pace & working style" },
  { title: "Match review", detail: "One high-signal introduction" },
];

const PROGRESS_BY_STAGE = [18, 42, 68, 88];

interface DisplayMessage {
  key: string;
  role: "user" | "assistant";
  content: string;
  status?: LocalTurn["status"];
  errorCode?: string;
}

function createInitialConfiguration(): ChatConfiguration {
  const url = import.meta.env.VITE_CHAT_WS_URL?.trim() ?? "";
  const environmentUsername = import.meta.env.VITE_CHAT_USERNAME?.trim() ?? "";
  let storedUsername = "";

  try {
    storedUsername = window.localStorage.getItem(USERNAME_STORAGE_KEY) ?? "";
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  const username = normalizeUsername(storedUsername || environmentUsername);
  return {
    mode: url && USERNAME_PATTERN.test(username) ? "live" : "demo",
    url,
    username,
  };
}

function connectionLabel(state: ProtocolState, mode: ChatConfiguration["mode"]) {
  if (state.connection === "ready") return mode === "demo" ? "Demo agent" : "Agent online";
  if (state.connection === "connecting") return "Connecting";
  if (state.connection === "awaiting-history") return "Loading brief";
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

function MessageStatus({ message }: { message: DisplayMessage }) {
  if (message.status === "incomplete") {
    return <span className="message-note">Answer ended before completion</span>;
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

export default function App() {
  const [configuration, setConfiguration] = useState(createInitialConfiguration);
  const [draftConfiguration, setDraftConfiguration] = useState(configuration);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [composerError, setComposerError] = useState("");
  const [content, setContent] = useState("");
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
  const stageIndex = Math.min(userAnswerCount, BRIEF_STAGES.length - 1);
  const currentStage = BRIEF_STAGES[stageIndex];
  const progress = userAnswerCount >= BRIEF_STAGES.length ? 100 : PROGRESS_BY_STAGE[stageIndex];

  useEffect(() => {
    const conversation = conversationRef.current;
    if (!conversation) return;

    const frame = window.requestAnimationFrame(() => {
      conversation.scrollTop = conversation.scrollHeight;
    });

    return () => window.cancelAnimationFrame(frame);
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
    let username = normalizeUsername(draftConfiguration.username);
    if (draftConfiguration.mode === "live" && !/^wss?:\/\//i.test(url)) {
      setSettingsError("Enter a WebSocket URL beginning with ws:// or wss://.");
      return;
    }

    if (draftConfiguration.mode === "live") {
      try {
        username = validateUsername(username);
      } catch (error) {
        setSettingsError(
          error instanceof Error ? error.message : "Enter a valid username.",
        );
        return;
      }

      try {
        window.localStorage.setItem(USERNAME_STORAGE_KEY, username);
      } catch {
        // The in-memory value still supports reconnects during this page load.
      }
    }

    const next = { ...draftConfiguration, url, username };
    const unchanged = JSON.stringify(next) === JSON.stringify(configuration);
    setSettingsOpen(false);
    setSettingsError("");
    if (unchanged) reconnect();
    else setConfiguration(next);
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <div className="brand-lockup">
          <span className="pair-mark" aria-hidden="true"><i /><i /></span>
          <div>
            <strong>cofounder</strong>
            <strong>match</strong>
          </div>
          <span className="brand-beta">beta</span>
        </div>

        <section className="brief-progress" aria-label="Founder brief progress">
          <div className="progress-heading">
            <div>
              <span className="eyebrow">Your founder brief</span>
              <strong>{progress}%</strong>
            </div>
            <span>0{stageIndex + 1}/04</span>
          </div>
          <div className="progress-track"><i style={{ width: `${progress}%` }} /></div>

          <ol className="stage-list">
            {BRIEF_STAGES.map((stage, index) => (
              <li
                key={stage.title}
                className={index < stageIndex ? "complete" : index === stageIndex ? "active" : ""}
              >
                <span className="stage-marker">
                  {index < stageIndex ? <Check size={12} aria-label="Complete" /> : `0${index + 1}`}
                </span>
                <div>
                  <strong>{stage.title}</strong>
                  <span>{stage.detail}</span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="rail-footer">
          <LockKeyhole size={15} aria-hidden="true" />
          <div>
            <strong>Private by default</strong>
            <span>Only mutual matches see your profile</span>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="workspace-header">
          <div>
            <span className="eyebrow">0{stageIndex + 1} · Founder interview</span>
            <h1>{currentStage.title}</h1>
          </div>
          <div className="header-actions">
            <span className={`connection-status connection-status--${state.connection}`}>
              <i />
              {connectionLabel(state, configuration.mode)}
            </span>
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
              aria-label="Open agent settings"
              title="Agent settings"
            >
              <Settings2 size={19} aria-hidden="true" />
            </button>
          </div>
        </header>

        {state.lastError ? (
          <div className="error-banner" role="alert">
            <CircleAlert size={17} aria-hidden="true" />
            <span><strong>{state.lastError.code}</strong>{state.lastError.message}</span>
          </div>
        ) : null}

        <section
          ref={conversationRef}
          className="conversation"
          aria-label="Founder interview"
        >
          {messages.length === 0 ? (
            <div className="empty-state">
              <div className="pair-orbit" aria-hidden="true"><i /><i /></div>
              <span className="empty-kicker">Your match starts here</span>
              <h2>What are you building—and what can’t you build alone?</h2>
              <p>
                I’ll turn the honest version into a founder brief, search the pool,
                and bring back one person worth meeting.
              </p>
              <div className="prompt-list" aria-label="Starting points">
                {STARTING_PATHS.map((prompt, index) => (
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
                <article className={`message message--${message.role}`} key={message.key}>
                  <div className="message-label">
                    <span>{message.role === "assistant" ? "Match agent" : "You"}</span>
                    {message.role === "assistant" && message.status === "completed" ? (
                      <Check size={13} aria-label="Completed" />
                    ) : null}
                  </div>
                  {message.role === "assistant" && message.status === "active" && !message.content ? (
                    <div className="thinking" aria-label="Match agent is thinking">
                      <i /><i /><i /><span>Building your brief</span>
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
        </section>

        <div className="composer-wrap">
          <form className="composer" onSubmit={onSubmit}>
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder={isReady ? "Tell me the honest version…" : "Waiting for the match agent…"}
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
            <span>{composerError || (isActive ? "One answer at a time" : "Enter to send · Shift + Enter for a new line")}</span>
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
                <span className="eyebrow">Match harness</span>
                <h2 id="settings-title">Agent connection</h2>
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
                  <Play size={17} aria-hidden="true" />
                  <span><strong>Demo</strong><small>Try the interview</small></span>
                </button>
                <button
                  type="button"
                  className={draftConfiguration.mode === "live" ? "selected" : ""}
                  onClick={() => setDraftConfiguration((current) => ({ ...current, mode: "live" }))}
                >
                  <Radio size={17} aria-hidden="true" />
                  <span><strong>Live</strong><small>Connect the harness</small></span>
                </button>
              </fieldset>

              {draftConfiguration.mode === "live" ? (
                <div className="live-fields">
                  <label className="field">
                    <span>Username</span>
                    <input
                      type="text"
                      value={draftConfiguration.username}
                      onChange={(event) => setDraftConfiguration((current) => ({ ...current, username: event.target.value }))}
                      placeholder="alice_123"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      maxLength={32}
                      autoFocus
                    />
                    <small>Saved on this device · lowercased automatically</small>
                  </label>
                  <label className="field">
                    <span>WebSocket server</span>
                    <input
                      type="url"
                      value={draftConfiguration.url}
                      onChange={(event) => setDraftConfiguration((current) => ({ ...current, url: event.target.value }))}
                      placeholder="wss://api.example.com"
                    />
                    <small>The client connects to /chat?username=…</small>
                  </label>
                  <div className="auth-warning">
                    <CircleAlert size={16} aria-hidden="true" />
                    <p>
                      <strong>Username is not authentication.</strong>
                      There is no password, so anyone can claim any username.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="demo-note">
                  Demo mode simulates the founder interview locally. Nothing you type leaves this browser.
                </p>
              )}

              <div className="harness-note">
                <LockKeyhole size={16} aria-hidden="true" />
                <p>
                  <strong>The harness stays private.</strong>
                  Matching, scoring, and specialist-agent work happen on the server. You only see the final response stream.
                </p>
              </div>

              {settingsError ? <p className="form-error" role="alert">{settingsError}</p> : null}
              <button className="apply-button" type="submit">
                Start fresh session
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </form>
          </aside>
        </>
      ) : null}
    </div>
  );
}
