import { describe, expect, it, vi } from "vitest";
import {
  OpenAITicketProtocol,
  readOpenAIResponseText,
} from "./OpenAITicketProtocol";
import type { ProtocolState } from "./types";

describe("OpenAI ticket matcher", () => {
  it("sends the fake catalog and full conversation directly to Responses API", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "Strong fit.\n\n[[ticket:cal-16841]]" }],
      }],
    }), { status: 200 }));
    let state: ProtocolState | undefined;
    const client = new OpenAITicketProtocol("sk-test", (next) => {
      state = next;
    }, fetcher);

    client.connect();
    client.sendUserMessage("Find me a TypeScript ticket I can ship this weekend.");

    await vi.waitFor(() => expect(state?.activeTurn).toBeNull());
    const [, init] = fetcher.mock.calls[0];
    const request = JSON.parse(String(init?.body));

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.openai.com/v1/responses",
      expect.objectContaining({ method: "POST" }),
    );
    expect(request.instructions).toContain("[[ticket:cal-16841]]");
    expect(request.instructions).toContain("bare GitHub-style handle");
    expect(request.input).toEqual([
      { role: "user", content: "Find me a TypeScript ticket I can ship this weekend." },
    ]);
    expect(state?.completedTurn?.content).toContain("[[ticket:cal-16841]]");
  });

  it("reads text from the raw Responses API output array", () => {
    expect(readOpenAIResponseText({
      output: [{
        type: "message",
        content: [{ type: "output_text", text: "One match" }],
      }],
    })).toBe("One match");
  });
});
