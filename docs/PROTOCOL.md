# Frontend WebSocket contract

ticket.run implements a sequential chat protocol with server-internal tool calls.

## HTTP upgrade handshake

Before any JSON messages are exchanged, the browser opens the socket with a normalized username and requests the `openai-chat.v1` WebSocket subprotocol:

```ts
new WebSocket(
  "wss://example.com/chat?username=alice_123",
  "openai-chat.v1",
);
```

Usernames are lowercased and must match `^[a-z0-9_]{3,32}$`. The frontend stores the normalized value locally and reuses it whenever it creates a replacement socket. The current browser-compatible implementation sends the username through the `username` query parameter; the backend must use the same configured parameter.

This identifies a chat namespace but is not secure authentication. There is no password or ownership proof, so anyone can claim any username.

## Connection lifecycle

```text
disconnected → connecting → awaiting-history → ready
```

1. Open one WebSocket.
2. On `open`, send one `Init` text frame.
3. Wait for `History` before enabling `UserMessage`.
4. Replace the server-history snapshot whenever a new connection initializes.
5. On reconnect, create a new socket and repeat initialization. There is no resume message.

Every application message is one JSON object in one WebSocket text frame. Arrays, binary frames, extra negotiation messages, and protocol metadata are unsupported.

## Turn lifecycle

```text
idle → awaiting-response → streaming → idle
```

Only one user turn may be active. After a `UserMessage`, the first server event may be an `AssistantDelta`, `AssistantDone`, `Error`, or socket close. Hidden model and tool work can occur before that event.

Each `AssistantDelta.content` is appended to the current assistant buffer. `AssistantDone.content` is the complete response and replaces that buffer:

```ts
assistantBuffer = done.content;
```

Only `finish_reason: "completed"` means the assistant response was persisted. `"incomplete"`, `"failed"`, and `null` are non-durable outcomes.

## Recovery rules

If the socket closes during a turn, its server outcome is uncertain. The client:

- preserves the attempted user content and partial assistant text as unresolved UI state;
- does not automatically resend the user message;
- does not resume the partial assistant stream;
- reconnects with a new socket and new `Init`;
- replaces visible server history after the next `History` snapshot;
- does not deduplicate messages by text.

Each physical socket has a local generation number. Events from replaced generations are ignored.

## Client messages

### `Init`

All framework fields are required.

```ts
interface InitMessage {
  type: "Init";
  frameworks: {
    coaching_cycle:
      | "impact-cycle"
      | "student-centered-coaching"
      | "peer-coaching";
    coaching_conversation: "cognitive-coaching" | "grow";
    teaching_framework: "class" | "danielson" | "udl";
    continuous_improvement: "plc" | "pdsa";
  };
}
```

### `UserMessage`

```ts
interface UserMessage {
  type: "UserMessage";
  content: string;
}
```

Content is limited to 32,000 Unicode scalar values. JavaScript UTF-16 `string.length` is not used for this check.

## Server messages

```ts
type ServerMessage =
  | { type: "History"; items: HistoryItem[] }
  | { type: "AssistantDelta"; content: string }
  | {
      type: "AssistantDone";
      content: string;
      finish_reason: "completed" | "incomplete" | "failed" | null;
    }
  | { type: "Error"; code: string; message: string };
```

`HistoryItem.created_at` is treated as an opaque nine-number tuple. The client does not pass it to `Date`.

Application `Error` ends an active turn but does not itself prove that the connection closed. A separate socket close updates connection state. The UI branches on stable error `code` values, not English messages.

## Intentionally unsupported

ticket.run never sends or expects cancellation, acknowledgement, resume, heartbeat, progress, message IDs, turn IDs, sequence numbers, tool-call events, or batched application messages.
