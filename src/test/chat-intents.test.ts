// @vitest-environment node
import { describe, expect, it } from "vitest";
import { extractChatAction, parseChatIntent } from "@/lib/chat-intents";

describe("chat instructions route to tools", () => {
  it.each([
    ["Start browser and login to Facebook.", { type: "connect_platform", platform: "facebook" }],
    ["Open Facebook and let me log in.", { type: "connect_platform", platform: "facebook" }],
    ["Open Facebook.", { type: "connect_platform", platform: "facebook" }],
    ["Connect my LinkedIn", { type: "connect_platform", platform: "linkedin" }],
    ["can you log me into instagram", { type: "connect_platform", platform: "instagram" }],
    ["sign in to nextdoor please", { type: "connect_platform", platform: "nextdoor" }],
    ["Connect Google Calendar", { type: "connect_platform", platform: "google_calendar" }],
    ["link our facebook page", { type: "connect_platform", platform: "facebook_page" }],
    ["open twitter", { type: "connect_platform", platform: "x" }],
    ["Use the browser to open Reddit", { type: "connect_platform", platform: "reddit" }],
    ["Open the browser.", { type: "open_browser" }],
    ["Show me what my Instagram agent is doing.", { type: "show_agent", platform: "instagram" }],
    ["what's the facebook agent working on?", { type: "show_agent", platform: "facebook" }],
    ["Pause the Facebook agent.", { type: "pause_agent", platform: "facebook", resume: false }],
    ["resume the facebook agent", { type: "pause_agent", platform: "facebook", resume: true }],
    ["pause all agents", { type: "pause_agent", platform: "all", resume: false }],
    ["Show my pending approvals.", { type: "show_approvals" }],
    ["what's waiting for my approval?", { type: "show_approvals" }],
    ["show my connections", { type: "show_connections" }],
    [
      "Show me our Facebook Page.",
      { type: "browse_task", platform: "facebook", objective: "Show me our Facebook Page." },
    ],
    ["check our instagram notifications", { type: "browse_task", platform: "instagram" }],
    ["Open our LinkedIn page", { type: "browse_task", platform: "linkedin" }],
  ])("%s", (message, expected) => {
    expect(parseChatIntent(message)).toMatchObject(expected);
  });

  it("keeps the rest of the goal for after sign-in", () => {
    expect(parseChatIntent("Log in to Facebook and find local groups for single parents")).toEqual({
      type: "connect_platform",
      platform: "facebook",
      goal: "find local groups for single parents",
    });
    expect(parseChatIntent("Start browser and login to Facebook.")).toEqual({
      type: "connect_platform",
      platform: "facebook",
    });
  });

  it.each([
    "Research local groups",
    "Start planning an event",
    "Find Facebook groups for single parents in Tucson",
    "Open a Facebook group for single parents",
    "Start a Facebook page for our food bank",
    "Should we focus on Instagram or Facebook?",
    "What's happening in Tucson this weekend?",
    "hi",
    "Draft an Instagram post about the fair",
  ])("leaves conversation and research alone: %s", (message) => {
    expect(parseChatIntent(message)).toBeNull();
  });
});

describe("tool requests from Civi's replies", () => {
  it("are validated and hidden", () => {
    expect(
      extractChatAction(
        'Opening Facebook for you.\n<civi_action>{"type":"connect_platform","platform":"facebook"}</civi_action>',
      ),
    ).toEqual({
      answer: "Opening Facebook for you.",
      action: { type: "connect_platform", platform: "facebook" },
    });
    expect(
      extractChatAction('Sure.<civi_action>{"type":"delete_everything"}</civi_action>'),
    ).toEqual({ answer: "Sure." });
  });
});
