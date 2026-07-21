# Fieldnote

A polished, protocol-correct frontend for sequential WebSocket coaching chat. It streams assistant text while keeping tool calls, tool output, and hidden reasoning entirely server-side.

[![CI](https://github.com/AkbarDevop/streaming-chat-ui/actions/workflows/ci.yml/badge.svg)](https://github.com/AkbarDevop/streaming-chat-ui/actions/workflows/ci.yml)
[![Deploy to GitHub Pages](https://github.com/AkbarDevop/streaming-chat-ui/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/AkbarDevop/streaming-chat-ui/actions/workflows/deploy-pages.yml)

![Fieldnote conversation workspace](output/playwright/desktop-empty.png)

## What it includes

- Exact `Init` → `History` → `UserMessage` → `AssistantDelta*` → `AssistantDone` flow
- One active turn at a time, with send controls locked during generation
- Authoritative `AssistantDone.content` replacement—never duplicated delta text
- Strict server-message decoder and 32,000 Unicode-scalar client limit
- Reconnection through a fresh socket and fresh `History` snapshot
- Stale-socket callback protection and explicit uncertain-turn state
- All four configurable coaching/teaching framework fields
- Responsive, accessible desktop and mobile interface
- Built-in demo stream for UI evaluation without a backend
- 19 protocol regression tests and automated GitHub Pages deployment

## Quick start

```bash
npm install
npm run dev
```

Fieldnote starts in demo mode when no endpoint is configured. Open **Connection settings** to switch to a real socket at runtime.

To start in live mode, create `.env.local`:

```bash
VITE_CHAT_WS_URL=wss://your-api.example.com/session-chat
```

Then restart the development server. The browser sends exactly one `Init` after the socket opens and enables the composer only after `History` arrives.

## Protocol behavior

The client emits only these message shapes:

```json
{
  "type": "Init",
  "frameworks": {
    "coaching_cycle": "impact-cycle",
    "coaching_conversation": "grow",
    "teaching_framework": "class",
    "continuous_improvement": "plc"
  }
}
```

```json
{
  "type": "UserMessage",
  "content": "What patterns can you identify?"
}
```

It accepts `History`, `AssistantDelta`, `AssistantDone`, and `Error`. Tool calls produce no client-visible event, so the UI remains in `awaiting-response` until a delta, terminal message, error, or connection loss arrives.

See [docs/PROTOCOL.md](docs/PROTOCOL.md) for the frontend contract and recovery rules.

## Project layout

```text
src/
├── hooks/useChatProtocol.ts         React lifecycle adapter
├── protocol/
│   ├── codec.ts                     Wire encoders, decoder, scalar validation
│   ├── reducer.ts                   Connection and turn state machines
│   ├── CompatibleChatProtocol.ts    Real WebSocket manager
│   ├── DemoChatProtocol.ts          Local protocol simulator
│   └── *.test.ts                    Regression suite
├── App.tsx                          Product UI and session configuration
└── styles.css                       Responsive visual system and motion
```

## Commands

```bash
npm run dev        # local development
npm test           # protocol test suite
npm run typecheck  # strict TypeScript checks
npm run build      # production bundle
npm run preview    # serve the production bundle
```

## Deployment

Every push to `main` runs tests, type checking, and a production build. The Pages workflow publishes `dist/` to GitHub Pages. The Vite build uses relative asset paths, so it works under a repository subpath.

For a live backend, either set `VITE_CHAT_WS_URL` during the build or enter the endpoint in the deployed app. Your WebSocket server must accept connections from the deployed page’s origin.

## License

[MIT](LICENSE)
