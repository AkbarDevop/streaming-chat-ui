import { describe, expect, it } from "vitest";
import { createDemoResponse } from "./DemoChatProtocol";

describe("demo founder interview", () => {
  const conversation = [
    "I want to find the right problem together.",
    "power systems and ai agents",
    "i want to go full time",
    "i built hiroo.me and unicraft.uz",
    "i built an ai b2b agent",
  ];

  it("asks one new profile question at a time", () => {
    expect(createDemoResponse(conversation.slice(0, 1))).toContain("Which domains");
    expect(createDemoResponse(conversation.slice(0, 2))).toContain("commitment level");
    expect(createDemoResponse(conversation.slice(0, 3))).toContain("strongest thing");
    expect(createDemoResponse(conversation.slice(0, 4))).toContain(
      "behavior you absolutely cannot tolerate",
    );
  });

  it("accumulates repeated proof instead of repeating the generic fallback", () => {
    const firstProofResponse = createDemoResponse(conversation.slice(0, 4));
    const secondProofResponse = createDemoResponse(conversation);

    expect(secondProofResponse).toContain("another proof point");
    expect(secondProofResponse).toContain("i built an ai b2b agent");
    expect(secondProofResponse).not.toBe(firstProofResponse);
  });

  it("produces a founder brief after the final missing field", () => {
    const response = createDemoResponse([
      ...conversation,
      "I cannot tolerate dishonesty or poor communication.",
    ]);

    expect(response).toContain("Your founder brief is ready");
    expect(response).toContain("power systems and ai agents");
    expect(response).toContain("hiroo.me and unicraft.uz");
    expect(response).toContain("dishonesty or poor communication");
  });

  it("handles the technical and commercial starting paths", () => {
    expect(
      createDemoResponse(["I’m technical and need a commercial cofounder."]),
    ).toContain("bring the technical side");
    expect(
      createDemoResponse(["I have traction and need someone who can build."]),
    ).toContain("customer and commercial context");
  });
});
