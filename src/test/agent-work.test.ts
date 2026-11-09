// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
import { handleAgentWork } from "@/lib/agent-work.server";
const org = "11111111-1111-4111-8111-111111111111";
const task = {
  id: "22222222-2222-4222-8222-222222222222",
  status: "running",
  agent_id: "33333333-3333-4333-8333-333333333333",
  event_id: "44444444-4444-4444-8444-444444444444",
  skill_id: "community_presence" as const,
  research_request_id: "55555555-5555-4555-8555-555555555555",
  objective: "Build a helpful local community presence",
  lease_id: "lease",
  result: "Saved outcome",
};
const request = (body: unknown = { organizationId: org, taskId: task.id }, token = "fixture") =>
  new Request("https://civimeet.example/api/agent/work", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
function deps() {
  return {
    authorize: vi.fn().mockResolvedValue("actor"),
    claim: vi.fn().mockResolvedValue({ replayed: false, task }),
    research: vi
      .fn()
      .mockResolvedValue(
        Response.json({
          run: { id: "run", status: "completed", result: { answer: "Sourced local plan" } },
        }),
      ),
    finish: vi.fn().mockResolvedValue(undefined),
  };
}
it("runs only saved task parameters with the stable research request ID and saves a checkpoint", async () => {
  const d = deps();
  const r = await handleAgentWork(request(), d);
  expect(r.status).toBe(200);
  expect(d.authorize).toHaveBeenCalledWith("fixture", org);
  expect(d.claim).toHaveBeenCalledWith("actor", org, task.id);
  const input = await d.research.mock.calls[0]![0].json();
  expect(input).toMatchObject({
    requestId: task.research_request_id,
    eventId: task.event_id,
    skillId: "community_presence",
    includeKnowledge: true,
    agentId: task.agent_id,
  });
  expect(d.finish).toHaveBeenCalledWith(
    "actor",
    org,
    task,
    true,
    expect.stringContaining("no external actions"),
  );
});
it("does not spend or finish work when authorization fails", async () => {
  const d = deps();
  d.authorize.mockRejectedValue(Error("denied"));
  await handleAgentWork(request(), d);
  expect(d.claim).not.toHaveBeenCalled();
  expect(d.research).not.toHaveBeenCalled();
});
it("replays completed work without running the provider again", async () => {
  const d = deps();
  d.claim.mockResolvedValue({ replayed: true, task: { ...task, status: "completed" } });
  expect((await handleAgentWork(request(), d)).status).toBe(200);
  expect(d.research).not.toHaveBeenCalled();
  expect(d.finish).not.toHaveBeenCalled();
});
it("rejects caller attempts to replace the saved objective or agent", async () => {
  const d = deps();
  expect(
    (
      await handleAgentWork(
        request({ organizationId: org, taskId: task.id, objective: "publish now" }),
        d,
      )
    ).status,
  ).toBe(400);
  expect(d.claim).not.toHaveBeenCalled();
});
it("leaves a running research request recoverable without claiming success", async () => {
  const d = deps();
  d.research.mockResolvedValue(Response.json({ run: { status: "running" } }, { status: 202 }));
  expect((await handleAgentWork(request(), d)).status).toBe(202);
  expect(d.finish).not.toHaveBeenCalled();
});
it("records a failed research outcome without completing the task", async () => {
  const d = deps();
  d.research.mockResolvedValue(
    Response.json({ error: "Daily research limit reached" }, { status: 429 }),
  );
  expect((await handleAgentWork(request(), d)).status).toBe(409);
  expect(d.finish).toHaveBeenCalledWith("actor", org, task, false, "Daily research limit reached");
});
it("rejects cross-site work and oversized bodies before authorization", async () => {
  const d = deps();
  const r = request();
  r.headers.set("Origin", "https://other.example");
  expect((await handleAgentWork(r, d)).status).toBe(403);
  expect((await handleAgentWork(request({ extra: "x".repeat(3000) }), d)).status).toBe(413);
  expect(d.authorize).not.toHaveBeenCalled();
});
