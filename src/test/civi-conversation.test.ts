// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { extractEventDraft, missingEventDetails, platformRoles } from "@/lib/civi";
import { researchCommunity } from "@/lib/perplexity.server";
import { handleStewardResearch } from "@/lib/steward-research.server";

const future = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
const line = (fields: Record<string, unknown>) =>
  `<event_details>${JSON.stringify({ stage: "gathering", ...fields })}</event_details>`;

describe("event details gathered in conversation", () => {
  it("strips the hidden line and keeps what is known", () => {
    const { answer, eventDraft } = extractEventDraft(
      `Love it! Roughly how many people?\n${line({ format: "in_person", location: "Tucson, AZ" })}`,
    );
    expect(answer).toBe("Love it! Roughly how many people?");
    expect(eventDraft).toMatchObject({
      format: "in_person",
      location: "Tucson, AZ",
      stage: "gathering",
    });
    expect(missingEventDetails(eventDraft!)).toEqual(["date", "how many people", "what it's for"]);
  });
  it("is ready only when the details are actually there, whatever the model claims", () => {
    expect(
      extractEventDraft(`Ok ${line({ stage: "ready", format: "virtual" })}`).eventDraft?.stage,
    ).toBe("gathering");
    const ready = extractEventDraft(
      line({
        format: "in_person",
        location: "Tucson",
        date: future,
        attendance: 60,
        goal: "Meet single parents",
      }),
    ).eventDraft;
    expect(ready?.stage).toBe("ready");
  });
  it("drops past dates and survives malformed lines", () => {
    expect(extractEventDraft(line({ date: "2020-01-01" })).eventDraft?.date).toBeNull();
    expect(extractEventDraft("Hi there <event_details>{not json</event_details>")).toEqual({
      answer: "Hi there",
    });
  });
  it("gives every connected platform a role", () => {
    expect(platformRoles["linkedin"]?.role).toBe("Partnership development manager");
    expect(platformRoles["facebook"]?.role).toBe("Neighborhood community manager");
  });
});

describe("conversation mode", () => {
  it("talks as Civi, keeps replies short, and returns the event details separately", async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        id: "r",
        status: "completed",
        model: "openai/gpt-6-sol",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [
              { type: "output_text", text: `Where in Tucson?\n${line({ format: "in_person" })}` },
            ],
          },
        ],
      }),
    );
    const result = await researchCommunity(
      { question: "let's plan an event", location: "Tucson", purpose: "general" },
      { apiKey: "key", fetcher, skillId: "conversation", context: "brief" },
    );
    const body = JSON.parse(
      String((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body),
    );
    expect(body.instructions).toContain("You are Civi");
    expect(body.instructions).toContain("do NOT write a plan yet");
    expect(body.max_tool_calls).toBe(2);
    expect(body.model).toBe("openai/gpt-6-sol");
    expect(result.answer).toBe("Where in Tucson?");
    expect(result.eventDraft?.format).toBe("in_person");
  });
  it("routes chat with the main agent to conversation instead of a research brief", async () => {
    const research = vi.fn().mockResolvedValue({
      provider: "perplexity",
      id: "r",
      answer: "Where in Tucson?",
      sources: [],
      model: "m",
      researchedAt: new Date().toISOString(),
      usage: { inputTokens: null, outputTokens: null, costUsd: null },
    });
    const response = await handleStewardResearch(
      new Request("https://civimeet.example/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer s" },
        body: JSON.stringify({
          organizationId: "4afef7ba-f3ae-4a34-a4dc-c255a8c81bd0",
          requestId: "6b4e9821-f58b-4aa9-b376-2352fb0d4f24",
          question: "hi",
          purpose: "general",
          location: "Tucson",
          threadKey: "main",
          skillId: "auto",
        }),
      }),
      {
        configured: () => true,
        authorize: vi.fn().mockResolvedValue("user"),
        reserve: vi
          .fn()
          .mockResolvedValue({
            started: true,
            run: { id: "run", status: "running", result: null, error: null },
          }),
        context: vi.fn().mockResolvedValue(""),
        research,
        finish: vi.fn().mockResolvedValue(undefined),
      },
    );
    expect(response.status).toBe(200);
    expect(research.mock.calls[0]![3]).toBe("conversation");
  });
});
