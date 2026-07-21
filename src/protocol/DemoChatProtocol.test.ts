import { describe, expect, it } from "vitest";
import { createDemoResponse } from "./DemoChatProtocol";

describe("demo ticket matcher", () => {
  it("does not re-ask for time already supplied in the work request", () => {
    const response = createDemoResponse([
      "Find me a TypeScript ticket I can ship this weekend.",
    ]);

    expect(response).toContain("paste your GitHub profile");
    expect(response).not.toContain("how much time");
    expect(response).not.toContain("[[ticket:");
  });

  it("asks only for the remaining signal", () => {
    const proofOnly = createDemoResponse([
      "I want TypeScript scheduling work",
      "I built hiroo.me and shipped its agent dashboard",
    ]);
    const timeOnly = createDemoResponse([
      "I want TypeScript scheduling work",
      "I have 8 hours this weekend",
    ]);

    expect(proofOnly).toContain("How much time");
    expect(timeOnly).toContain("paste your GitHub profile");
  });

  it("returns one match when proof and availability are present", () => {
    const response = createDemoResponse([
      "Find me a TypeScript ticket",
      "I built hiroo.me and have 8 hours this weekend",
    ]);

    expect(response).toContain("one ticket");
    expect(response).toContain("[[ticket:cal-16841]]");
    expect(response.match(/\[\[ticket:/g)).toHaveLength(1);
  });

  it("routes stack signals to a relevant private match", () => {
    const complete = (request: string) =>
      createDemoResponse([
        request,
        "github.com/example/repo",
        "I have 10 hours this weekend",
      ]);

    expect(complete("I want Rust parser work")).toContain("ruff-9127");
    expect(complete("I want Python validation work")).toContain("pydantic-10422");
    expect(complete("I want backend infrastructure work")).toContain("temporal-1732");
    expect(complete("I want React state management work")).toContain("plane-6234");
  });
});
