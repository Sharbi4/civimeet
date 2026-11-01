// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start/server-only", () => ({}));
vi.mock("@/lib/ai/responses.server", () => ({ createResponsesCall: vi.fn() }));
import { handleAnalyticsAnalysis } from "@/lib/analytics-analysis.server";
import { createResponsesCall } from "@/lib/ai/responses.server";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const payload = { organizationId: "11111111-1111-4111-8111-111111111111", filename: "report.csv", content: "Channel,Sessions\nSearch,120", goal: "More demo requests" };
function request(body = JSON.stringify(payload), token = "fixture-token") {
  return new Request("https://civimeet.example/api/analytics/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: token ? `Bearer ${token}` : "" }, body });
}
describe("Authenticated analytics analysis", () => {
  it("rejects signed-out and invalid report requests before calling AI", async () => {
    const authorize = vi.fn();
    expect((await handleAnalyticsAnalysis(request(undefined, ""), authorize)).status).toBe(401);
    expect((await handleAnalyticsAnalysis(request("{}"), authorize)).status).toBe(400);
    expect(authorize).not.toHaveBeenCalled();
    expect(createResponsesCall).not.toHaveBeenCalled();
  });
  it("does not use AI when organization authorization fails", async () => {
    await handleAnalyticsAnalysis(request(), async () => { throw new Error("No access"); });
    expect(createResponsesCall).not.toHaveBeenCalled();
  });
  it("streams findings and reasoning without buffering the whole analysis", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "fixture-key");
    vi.mocked(createResponsesCall).mockReturnValue({ result: { fullStream: (async function* () {
      yield { type: "start" }; yield { type: "reasoning-delta", text: "Checking channels" }; yield { type: "text-delta", text: "Search: 120 sessions." };
    })() }, gateway: { waitForRunId: async () => "run-test", getRunId: () => "run-test" } } as unknown as ReturnType<typeof createResponsesCall>);
    const response = await handleAnalyticsAnalysis(request(), async () => {});
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Lovable-AIG-Run-ID")).toBe("run-test");
    const lines = (await response.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toEqual([{ type: "reasoning", text: "Checking channels" }, { type: "text", text: "Search: 120 sessions." }, { type: "done" }]);
  });
});