import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BrowserWorkspaceProvider, PlatformBrowser, requestAgentBrowse } from "@/components/workspace/BrowserDock";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("renders the workspace without a browser dock or any legacy browser request", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  render(<BrowserWorkspaceProvider><p>Civi chat</p><PlatformBrowser agentId="old-agent" /></BrowserWorkspaceProvider>);
  requestAgentBrowse({ organizationId: "org", url: "https://example.com", task: "browse" });
  expect(screen.getByText("Civi chat")).toBeTruthy();
  expect(screen.queryByRole("button")).toBeNull();
  expect(document.querySelector("iframe")).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
