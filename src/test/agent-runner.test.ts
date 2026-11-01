// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import {
  executeTask,
  handleAgentRun,
  type AgentTask,
  type RunnerDeps,
} from "@/lib/agent-runner.server";
import { extractPlan } from "@/lib/civi";

const org = "11111111-1111-4111-8111-111111111111";
const planId = "22222222-2222-4222-8222-222222222222";
const plan = {
  id: planId,
  title: "Single parents launch",
  goal: "Build a Tucson single-parent community",
  created_by: "u",
};
const future = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
const task = (overrides: Partial<AgentTask>): AgentTask => ({
  id: "t1",
  organization_id: org,
  plan_id: planId,
  position: 1,
  title: "Research single-parent communities",
  detail: "",
  agent: "main",
  kind: "research",
  level: "research",
  depends_on: [],
  input: {},
  lease_id: "lease",
  result: null,
  ...overrides,
});
const research = {
  provider: "perplexity" as const,
  id: "r",
  answer: "Three active parent groups; none for single parents on the south side.",
  sources: [{ id: 1, title: "Group", url: "https://example.org/group" }],
  model: "openai/gpt-6-sol",
  researchedAt: new Date().toISOString(),
  usage: { inputTokens: null, outputTokens: null, costUsd: null },
};
function deps(overrides: Partial<RunnerDeps> = {}) {
  const base = {
    configured: () => true,
    authorize: vi.fn(async () => "actor"),
    claim: vi.fn(async () => null),
    finish: vi.fn(async () => {}),
    waiting: vi.fn(async () => []),
    approval: vi.fn(async () => null),
    settleWaiting: vi.fn(async () => {}),
    context: vi.fn(async () => ({ area: "Tucson, AZ", text: "context" })),
    research: vi.fn(async () => research),
    saveKnowledge: vi.fn(async () => {}),
    remember: vi.fn(async () => {}),
    connection: vi.fn(async () => "not_connected"),
    createApproval: vi.fn(async () => "approval-1"),
    dependencyDraft: vi.fn(async () => null),
    createEvent: vi.fn(async () => "event-1"),
  };
  return { ...base, ...overrides } as unknown as RunnerDeps & typeof base;
}

describe("task execution never overstates what happened", () => {
  it("research saves sourced findings as knowledge", async () => {
    const d = deps();
    const outcome = await executeTask(d, "actor", plan, task({}));
    expect(outcome).toMatchObject({ status: "done", result: { summary: research.answer } });
    expect(d.saveKnowledge).toHaveBeenCalled();
  });
  it("vendor discovery says nobody was contacted; venue research says nothing is booked", async () => {
    expect((await executeTask(deps(), "a", plan, task({ kind: "find_vendors" }))).detail).toContain(
      "Nobody has been contacted",
    );
    expect((await executeTask(deps(), "a", plan, task({ kind: "find_venues" }))).detail).toContain(
      "Nothing is booked",
    );
  });
  it("platform agents remember what they found", async () => {
    const d = deps();
    await executeTask(d, "a", plan, task({ agent: "facebook" }));
    expect(d.remember).toHaveBeenCalledWith(
      org,
      "facebook",
      "plan:t1",
      expect.stringContaining("Three active"),
      "https://example.org/group",
    );
  });
  it("a draft goes to Approvals and is reported as not published", async () => {
    const d = deps({
      research: vi.fn(async () => ({
        ...research,
        answer: "Tucson Single Parents Circle: a place to swap childcare tips.",
      })) as never,
    });
    const outcome = await executeTask(
      d,
      "a",
      plan,
      task({
        kind: "draft_content",
        level: "prepare",
        agent: "facebook",
        input: { destination: "New Facebook group" },
      }),
    );
    expect(outcome).toMatchObject({
      status: "done",
      detail: expect.stringContaining("Not published"),
      result: { approvalId: "approval-1" },
    });
    expect(d.createApproval).toHaveBeenCalledWith(
      org,
      "a",
      expect.objectContaining({ destination: "New Facebook group", kind: "post" }),
    );
    expect((d.research.mock.calls[0] as unknown[])[2]).toBe("draft");
  });
  it("an event is created only when its details are complete", async () => {
    const d = deps();
    const blocked = await executeTask(
      d,
      "a",
      plan,
      task({ kind: "create_event", input: { event: { format: "in_person", location: "Tucson" } } }),
    );
    expect(blocked.status).toBe("blocked");
    expect(blocked.detail).toContain("date");
    expect(d.createEvent).not.toHaveBeenCalled();
    const done = await executeTask(
      d,
      "a",
      plan,
      task({
        kind: "create_event",
        input: {
          event: {
            format: "in_person",
            location: "Tucson",
            date: future,
            attendance: 40,
            goal: "First single parents meetup",
          },
        },
      }),
    );
    expect(done).toMatchObject({ status: "done", result: { eventId: "event-1" } });
  });
  it("connection steps report what is missing", async () => {
    const outcome = await executeTask(
      deps(),
      "a",
      plan,
      task({ kind: "connect_platform", input: { platform: "facebook" } }),
    );
    expect(outcome).toMatchObject({
      status: "blocked",
      result: { needs: "connection", connector: "facebook" },
    });
    expect(
      (
        await executeTask(
          deps({ connection: vi.fn(async () => "connected") as never }),
          "a",
          plan,
          task({ kind: "connect_platform", input: { platform: "facebook" } }),
        )
      ).status,
    ).toBe("done");
  });
  it("publishing needs the account and then waits for approval of the draft", async () => {
    expect(
      (
        await executeTask(
          deps(),
          "a",
          plan,
          task({ kind: "platform_action", level: "communicate", agent: "facebook" }),
        )
      ).status,
    ).toBe("blocked");
    const d = deps({
      connection: vi.fn(async () => "connected") as never,
      dependencyDraft: vi.fn(async () => ({
        approvalId: "draft-approval",
        draft: "Group text",
      })) as never,
    });
    const outcome = await executeTask(
      d,
      "a",
      plan,
      task({
        kind: "platform_action",
        level: "communicate",
        agent: "facebook",
        depends_on: [2],
        input: { action: "create_group" },
      }),
    );
    expect(outcome).toMatchObject({
      status: "waiting_approval",
      result: { approvalId: "draft-approval" },
    });
    expect(outcome.detail).toBe("Waiting for your approval to create group on Facebook.");
    expect(d.createApproval).not.toHaveBeenCalled();
  });
});

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://civimeet.com/api/agent/run", {
    method: "POST",
    headers: { Authorization: "Bearer s", "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
describe("the run endpoint", () => {
  it("requires a session, same-site requests and a plan", async () => {
    expect(
      (
        await handleAgentRun(
          new Request("https://civimeet.com/api/agent/run", { method: "POST" }),
          deps(),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await handleAgentRun(
          request({ organizationId: org, planId }, { Origin: "https://evil.example" }),
          deps(),
        )
      ).status,
    ).toBe(403);
    expect((await handleAgentRun(request({ organizationId: org }), deps())).status).toBe(400);
  });
  it("reports when there is nothing to run", async () => {
    const response = await handleAgentRun(request({ organizationId: org, planId }), deps());
    expect(await response.json()).toEqual({ ran: null });
  });
  it("records a real failure instead of claiming success", async () => {
    const d = deps({
      claim: vi.fn(async () => ({ task: task({}), plan })) as never,
      research: vi.fn(async () =>
        Promise.reject(new Error("Perplexity's usage limit was reached.")),
      ) as never,
    });
    const body = await (await handleAgentRun(request({ organizationId: org, planId }), d)).json();
    expect(body.ran).toMatchObject({
      status: "failed",
      detail: "Perplexity's usage limit was reached.",
    });
    expect(d.finish).toHaveBeenCalledWith(
      expect.objectContaining({ id: "t1" }),
      expect.objectContaining({ status: "failed" }),
    );
  });
  it("moves waiting steps on once a person decides, without pretending to publish", async () => {
    const d = deps({
      waiting: vi.fn(async () => [
        { id: "w1", agent: "facebook", input: {}, result: { approvalId: "a1" } },
        { id: "w2", agent: "facebook", input: {}, result: { approvalId: "a2" } },
      ]) as never,
      approval: vi.fn(async (_org: string, id: string) => ({
        id,
        status: id === "a1" ? "approved" : "rejected",
      })) as never,
    });
    await handleAgentRun(request({ organizationId: org, planId }), d);
    expect(d.settleWaiting).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ status: "blocked", detail: expect.stringContaining("Approved") }),
    );
    expect(d.settleWaiting).toHaveBeenCalledWith(
      "w2",
      expect.objectContaining({ status: "cancelled" }),
    );
  });
});

describe("plans proposed in conversation", () => {
  it("are extracted, validated and hidden from the reply", () => {
    const { answer, plan: proposed } = extractPlan(
      `Let's build it.\n<civi_plan>{"title":"Single parents launch","goal":"Build the community","steps":[{"title":"Research local groups","kind":"research","agent":"main"},{"title":"Launch rocket","kind":"launch_rocket"}]}</civi_plan>`,
    );
    expect(answer).toBe("Let's build it.");
    expect(proposed).toBeUndefined();
    const ok = extractPlan(
      `Starting now.<civi_plan>{"title":"Single parents launch","goal":"Build the community","steps":[{"title":"Research local groups","kind":"research","agent":"Facebook","dependsOn":[0,"x"]}]}</civi_plan>`,
    );
    expect(ok.plan?.steps[0]).toMatchObject({ kind: "research", agent: "facebook", dependsOn: [] });
  });
});
