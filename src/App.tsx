import {
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  GitBranch,
  GitFork,
  Hash,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";

type StackFilter = "all" | "typescript" | "python" | "rust" | "go";

interface Ticket {
  id: string;
  repo: string;
  issue: number;
  title: string;
  language: Exclude<StackFilter, "all">;
  bounty: number;
  match: number;
  difficulty: "medium" | "hard" | "expert";
  estimate: string;
  updated: string;
  maintainers: string;
  mergeRate: number;
  responseTime: string;
  labels: string[];
  summary: string;
  scope: string[];
  signals: string[];
  files: string[];
  branch: string;
  risk: string;
}

const STACKS: { id: StackFilter; label: string }[] = [
  { id: "all", label: "all" },
  { id: "typescript", label: "ts" },
  { id: "python", label: "py" },
  { id: "rust", label: "rs" },
  { id: "go", label: "go" },
];

const TICKETS: Ticket[] = [
  {
    id: "cal-16841",
    repo: "calcom/cal.com",
    issue: 16841,
    title: "Timezone-aware recurring availability overrides",
    language: "typescript",
    bounty: 1200,
    match: 96,
    difficulty: "hard",
    estimate: "6–9h",
    updated: "18m",
    maintainers: "responsive",
    mergeRate: 84,
    responseTime: "3.2h",
    labels: ["feature", "scheduling", "paid"],
    summary:
      "Recurring schedules currently inherit the organizer timezone after an override. Add explicit timezone ownership without changing existing availability behavior.",
    scope: [
      "Add timezone to recurring override schema",
      "Preserve legacy records through the migration",
      "Cover DST boundaries in availability tests",
    ],
    signals: [
      "You shipped date-heavy TypeScript code in 3 public repos",
      "Your merged PRs touch Prisma migrations and scheduling logic",
      "The maintainer usually reviews first submissions within one day",
    ],
    files: ["packages/prisma/schema.prisma", "packages/lib/availability.ts", "apps/web/test/availability.test.ts"],
    branch: "feat/recurring-timezones",
    risk: "DST fixtures are incomplete. Budget one hour to establish expected edge behavior before implementation.",
  },
  {
    id: "astral-9127",
    repo: "astral-sh/ruff",
    issue: 9127,
    title: "Preserve formatter comments around nested match guards",
    language: "rust",
    bounty: 850,
    match: 91,
    difficulty: "expert",
    estimate: "8–12h",
    updated: "42m",
    maintainers: "active",
    mergeRate: 79,
    responseTime: "5.7h",
    labels: ["formatter", "python", "bounty"],
    summary:
      "Comments attached to nested Python match guards can move after formatting. Retain stable placement across repeated formatter passes.",
    scope: [
      "Reproduce the nested guard comment drift",
      "Update comment attachment in the formatter AST",
      "Add idempotency fixtures for three nesting levels",
    ],
    signals: [
      "Your Rust parser work maps to this formatter boundary",
      "You have recent Python AST experience",
      "This repo merges focused fixtures before implementation changes",
    ],
    files: ["crates/ruff_python_formatter/src/comments.rs", "crates/ruff_python_formatter/tests/fixtures.rs"],
    branch: "fix/match-guard-comments",
    risk: "The visible bug is small, but comment ownership crosses two AST nodes. Expect maintainer guidance.",
  },
  {
    id: "pydantic-10422",
    repo: "pydantic/pydantic",
    issue: 10422,
    title: "Expose validation trace for discriminated unions",
    language: "python",
    bounty: 640,
    match: 88,
    difficulty: "medium",
    estimate: "4–6h",
    updated: "1h",
    maintainers: "responsive",
    mergeRate: 87,
    responseTime: "2.4h",
    labels: ["diagnostics", "v2", "good scope"],
    summary:
      "Add an opt-in trace explaining which discriminator branches were considered when a union fails validation.",
    scope: [
      "Define a stable trace result shape",
      "Expose branch decisions behind an opt-in flag",
      "Add JSON and Python-mode examples",
    ],
    signals: [
      "Your API tooling work includes structured error surfaces",
      "The issue fits your available five-hour block",
      "Acceptance criteria are complete and maintainer-confirmed",
    ],
    files: ["pydantic/type_adapter.py", "pydantic_core/core_schema.py", "tests/test_discriminated_union.py"],
    branch: "feat/union-validation-trace",
    risk: "Public API shape needs maintainer approval before implementation. Start with a typed proposal.",
  },
  {
    id: "temporal-1732",
    repo: "temporalio/sdk-go",
    issue: 1732,
    title: "Worker health signal for sticky queue starvation",
    language: "go",
    bounty: 1500,
    match: 86,
    difficulty: "hard",
    estimate: "10–14h",
    updated: "2h",
    maintainers: "active",
    mergeRate: 81,
    responseTime: "6.1h",
    labels: ["worker", "observability", "paid"],
    summary:
      "Expose a worker health signal when sticky task queues remain backlogged while pollers appear healthy.",
    scope: [
      "Track sticky queue starvation independently",
      "Surface a non-breaking worker diagnostic",
      "Simulate poller health with a stalled sticky queue",
    ],
    signals: [
      "Your distributed worker project matches the queue model",
      "You have production observability commits",
      "The bounty reflects a deeper test harness requirement",
    ],
    files: ["internal/internal_worker.go", "internal/common/metrics.go", "test/worker_test.go"],
    branch: "feat/sticky-queue-health",
    risk: "The integration test may be timing-sensitive. Validate the deterministic harness before changing worker code.",
  },
  {
    id: "plane-6234",
    repo: "makeplane/plane",
    issue: 6234,
    title: "Bulk move cycles without losing issue ordering",
    language: "typescript",
    bounty: 420,
    match: 82,
    difficulty: "medium",
    estimate: "3–5h",
    updated: "4h",
    maintainers: "active",
    mergeRate: 72,
    responseTime: "8.8h",
    labels: ["frontend", "state", "bounty"],
    summary:
      "Bulk cycle moves currently reset the manual ordering of affected issues. Preserve relative position across optimistic updates.",
    scope: [
      "Capture relative ordering before the mutation",
      "Apply a stable optimistic reorder",
      "Add rollback coverage for failed moves",
    ],
    signals: [
      "Your React state work is directly relevant",
      "The change is isolated to one product surface",
      "A maintainer supplied a failing reproduction",
    ],
    files: ["apps/web/store/cycle.store.ts", "apps/web/hooks/use-cycle-issues.ts"],
    branch: "fix/stable-cycle-move",
    risk: "Ordering is duplicated in client and API responses. Keep the patch client-side unless the reproduction proves otherwise.",
  },
];

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default function App() {
  const [stack, setStack] = useState<StackFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(TICKETS[0].id);
  const [claimedId, setClaimedId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const visibleTickets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return TICKETS.filter((ticket) => {
      const stackMatches = stack === "all" || ticket.language === stack;
      const queryMatches =
        !normalized ||
        `${ticket.repo} ${ticket.title} ${ticket.labels.join(" ")}`
          .toLowerCase()
          .includes(normalized);
      return stackMatches && queryMatches;
    });
  }, [query, stack]);

  const selected =
    TICKETS.find((ticket) => ticket.id === selectedId) ?? visibleTickets[0] ?? TICKETS[0];
  const isClaimed = claimedId === selected.id;

  useEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "/" && document.activeElement !== searchRef.current) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const selectTicket = (ticket: Ticket) => {
    setSelectedId(ticket.id);
  };

  return (
    <div className="app-frame">
      <header className="topbar">
        <a className="wordmark" href="#queue" aria-label="ticket.run home">
          <span className="wordmark-mark"><i /><i /><i /></span>
          <strong>ticket.run</strong>
          <small>alpha_04</small>
        </a>

        <nav className="topnav" aria-label="Primary navigation">
          <a className="active" href="#queue">match queue <span>05</span></a>
          <a href="#active">active run <span>{claimedId ? "01" : "00"}</span></a>
          <a href="#profile">proof graph</a>
        </nav>

        <div className="top-actions">
          <span className="index-status"><i /> index live</span>
          <button className="command-button" type="button" onClick={() => searchRef.current?.focus()}>
            <Command size={13} aria-hidden="true" /> K
          </button>
          <button className="avatar" type="button" aria-label="Open engineer profile">AK</button>
        </div>
      </header>

      <div className="workbench">
        <aside className="queue-panel" id="queue">
          <div className="panel-heading">
            <div>
              <span className="kicker">01 / opportunity index</span>
              <h1>Open tickets</h1>
            </div>
            <span className="queue-count">1,284 indexed</span>
          </div>

          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="filter repo, label, issue…"
              aria-label="Filter ticket queue"
            />
            <kbd>/</kbd>
          </label>

          <div className="stack-filter" aria-label="Filter by language">
            {STACKS.map((item) => (
              <button
                key={item.id}
                className={stack === item.id ? "active" : ""}
                type="button"
                onClick={() => setStack(item.id)}
              >
                {item.label}
              </button>
            ))}
            <button className="filter-more" type="button" aria-label="More filters">
              <ChevronDown size={13} />
            </button>
          </div>

          <div className="ticket-list" aria-live="polite">
            {visibleTickets.length ? (
              visibleTickets.map((ticket, index) => (
                <button
                  key={ticket.id}
                  type="button"
                  className={`ticket-row ${selected.id === ticket.id ? "selected" : ""}`}
                  onClick={() => selectTicket(ticket)}
                >
                  <span className="ticket-index">{String(index + 1).padStart(2, "0")}</span>
                  <span className="ticket-copy">
                    <span className="repo-line">
                      <span>{ticket.repo}</span>
                      <small>#{ticket.issue}</small>
                    </span>
                    <strong>{ticket.title}</strong>
                    <span className="ticket-meta">
                      <span>{ticket.language}</span>
                      <span>{ticket.estimate}</span>
                      <span>updated {ticket.updated}</span>
                    </span>
                  </span>
                  <span className="ticket-value">
                    <strong>{ticket.match}%</strong>
                    <small>{money(ticket.bounty)}</small>
                  </span>
                </button>
              ))
            ) : (
              <div className="no-results">
                <Terminal size={18} />
                <strong>no clean matches</strong>
                <span>clear filters or widen the stack</span>
              </div>
            )}
          </div>

          <div className="queue-footer">
            <span><Sparkles size={13} /> ranked against 47 proof signals</span>
            <button type="button">refresh index</button>
          </div>
        </aside>

        <main className="ticket-workspace">
          <div className="issue-path">
            <span>match/{selected.language}</span>
            <span>/</span>
            <strong>{selected.repo}</strong>
            <span>/</span>
            <strong>#{selected.issue}</strong>
          </div>

          <section className="issue-hero">
            <div className="issue-title-block">
              <div className="label-line">
                <span className="verified"><ShieldCheck size={13} /> scoped ticket</span>
                <span>{selected.difficulty}</span>
                <span>{selected.estimate}</span>
              </div>
              <h2>{selected.title}</h2>
              <div className="label-set">
                {selected.labels.map((label) => <span key={label}>#{label}</span>)}
              </div>
            </div>

            <div className="match-score" key={selected.id}>
              <span>fit score</span>
              <strong>{selected.match}<small>%</small></strong>
              <i style={{ "--score": `${selected.match * 3.6}deg` } as CSSProperties} />
            </div>
          </section>

          <section className="issue-brief">
            <span className="section-number">02</span>
            <div className="section-copy">
              <span className="kicker">ticket brief</span>
              <p>{selected.summary}</p>
            </div>
          </section>

          <section className="scope-grid">
            <div className="scope-column">
              <div className="section-label"><Hash size={13} /> expected patch</div>
              <ol>
                {selected.scope.map((item, index) => (
                  <li key={item}><span>0{index + 1}</span>{item}</li>
                ))}
              </ol>
            </div>
            <div className="scope-column files-column">
              <div className="section-label"><GitBranch size={13} /> likely surface</div>
              <ul>
                {selected.files.map((file) => <li key={file}>{file}</li>)}
              </ul>
              <div className="branch-line"><span>branch</span><code>{selected.branch}</code></div>
            </div>
          </section>

          <section className="risk-line">
            <span><Zap size={14} /> preflight note</span>
            <p>{selected.risk}</p>
          </section>

          <section className={`run-console ${isClaimed ? "active" : ""}`} id="active">
            <div className="console-head">
              <span><CircleDot size={12} /> {isClaimed ? "run initialized" : "ready to claim"}</span>
              <code>{isClaimed ? `run_${selected.issue}_ak` : "awaiting engineer"}</code>
            </div>
            {isClaimed ? (
              <div className="console-body">
                <p><span>00:00</span> ticket locked for 24 hours</p>
                <p><span>00:01</span> fork and branch instructions generated</p>
                <p><span>00:01</span> maintainer notified, preflight pending<span className="cursor" /></p>
              </div>
            ) : (
              <div className="console-idle">
                Claiming opens a private run, notifies the maintainer, and starts your merge clock.
              </div>
            )}
          </section>

          <div className="claim-bar">
            <div>
              <span className="kicker">verified bounty</span>
              <strong>{money(selected.bounty)}</strong>
              <small>paid after merge</small>
            </div>
            <button
              className={isClaimed ? "claimed" : ""}
              type="button"
              onClick={() => setClaimedId(isClaimed ? null : selected.id)}
            >
              {isClaimed ? <><Check size={17} /> ticket claimed</> : <>claim this ticket <ArrowUpRight size={17} /></>}
            </button>
          </div>
        </main>

        <aside className="proof-panel" id="profile">
          <div className="profile-head">
            <div className="profile-avatar">AK</div>
            <div>
              <span className="kicker">engineer proof graph</span>
              <strong>akbar@local</strong>
              <small><i /> synced 7m ago</small>
            </div>
            <GitFork size={18} aria-label="GitHub connected" />
          </div>

          <div className="proof-stats">
            <div><span>merged prs</span><strong>38</strong></div>
            <div><span>merge rate</span><strong>82%</strong></div>
            <div><span>median ship</span><strong>1.8d</strong></div>
          </div>

          <section className="why-match" key={`signals-${selected.id}`}>
            <div className="section-label"><Sparkles size={13} /> why this match</div>
            <ul>
              {selected.signals.map((signal, index) => (
                <li key={signal}><span>{String(index + 1).padStart(2, "0")}</span><p>{signal}</p></li>
              ))}
            </ul>
          </section>

          <section className="repo-health">
            <div className="section-label"><CircleDot size={13} /> repo health</div>
            <dl>
              <div><dt>maintainers</dt><dd>{selected.maintainers}</dd></div>
              <div><dt>contributor merge</dt><dd>{selected.mergeRate}%</dd></div>
              <div><dt>median response</dt><dd>{selected.responseTime}</dd></div>
              <div><dt>scope confidence</dt><dd>high</dd></div>
            </dl>
          </section>

          <div className="availability-block">
            <Clock3 size={15} />
            <div><span>your availability</span><strong>12h this week</strong></div>
            <button type="button">edit</button>
          </div>

          <p className="trust-note">
            Scores use public proof, issue quality, maintainer behavior, and available time. Never résumé keywords alone.
          </p>
        </aside>
      </div>
    </div>
  );
}
