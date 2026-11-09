import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserRun } from "@/components/workspace/BrowserRun";
import type { AgentRun } from "@/components/workspace/ChatActions";

const base: AgentRun = {
  id: "run",
  platform: "facebook",
  name: "Facebook",
  objective: "Show me our Facebook Page",
  status: "waiting_for_human",
  detail: "Meta flagged the next action for review.",
  currentAction: "Waiting for your decision",
  url: "https://www.facebook.com/",
  screenshot: "data:image/jpeg;base64,AAAA",
  viewer: null,
  safetyChecks: [{ id: "csc", code: "computer_action_requires_confirmation", message: null }],
  proposed: [
    { summary: "Click at 640, 431 (“Tucson Community Alliance”)", allowed: true },
    {
      summary: "Click at 900, 120 (“Post”)",
      allowed: false,
      reason: "Posting isn't allowed in read-only mode.",
    },
  ],
  events: [],
  actionId: null,
  result: null,
};

afterEach(cleanup);

describe("agent browser run view", () => {
  it("shows what Meta wants confirmed, what the agent would do, and Civi's verdict", () => {
    const onControl = vi.fn();
    render(<BrowserRun run={base} busy={null} onControl={onControl} />);
    expect(
      screen.getByText("Meta asks a person to confirm this action before it runs."),
    ).toBeTruthy();
    expect(screen.getByText(/Tucson Community Alliance/)).toBeTruthy();
    expect(screen.getByText(/Civi will block this: Posting isn't allowed/)).toBeTruthy();
    // Taking control is disabled until the person decides on the flagged step.
    expect(
      (screen.getByRole("button", { name: /Take control/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Allow and continue" }));
    expect(onControl).toHaveBeenCalledWith("approve_safety");
  });
});
