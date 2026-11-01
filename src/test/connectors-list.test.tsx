import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConnectorList, DemoConnectors } from "@/components/workspace/Connectors";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const actions = () => ({
  command: vi.fn(async () => ({ status: "connected" as const })),
  saveSettings: vi.fn(async () => {}),
});

describe("Connections list", () => {
  it("lists platforms by group with live status instead of tiles", () => {
    render(<DemoConnectors />);
    expect(screen.getByRole("heading", { name: "Connections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Community presence" })).toBeInTheDocument();
    expect(screen.getAllByRole("list").length).toBeGreaterThanOrEqual(4);
    const facebook = screen.getByRole("button", { name: /^Facebook · Tucson Community Alliance/ });
    expect(within(facebook).getByText("Connected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Instagram/ })).toHaveTextContent(
      "Needs a security check",
    );
  });

  it("offers live sign-in, saved login and official sign-in where each is available", () => {
    render(
      <ConnectorList
        rows={{}}
        events={[]}
        capabilities={{ browser: true, oauth: { meta_instagram: false } }}
        admin
        demo={false}
        live
        loadError=""
        actions={actions()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Instagram/ }));
    const methods = screen.getByRole("radiogroup", { name: "How to connect Instagram" });
    expect(
      within(methods)
        .getAllByRole("radio")
        .map((item) => item.textContent),
    ).toEqual(["Sign in live", "Save login", "Official sign-in"]);
    fireEvent.click(within(methods).getByRole("radio", { name: /Official sign-in/ }));
    expect(screen.getByRole("button", { name: /Continue with Instagram/ })).toBeDisabled();
    expect(screen.getByText(/META_APP_ID and META_APP_SECRET/)).toBeInTheDocument();
  });

  it("collects the platform's own login fields and clears the password after sending", async () => {
    const handlers = actions();
    render(
      <ConnectorList
        rows={{}}
        events={[]}
        capabilities={{ browser: true, oauth: {} }}
        admin
        demo={false}
        live
        loadError=""
        actions={handlers}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Facebook Groups, community comments/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Save login/ }));
    const identifier = screen.getByLabelText("Email or mobile number");
    const password = screen.getByLabelText("Password");
    fireEvent.change(identifier, { target: { value: "taylor@example.org" } });
    fireEvent.change(password, { target: { value: "secret-pass" } });
    fireEvent.click(screen.getByRole("button", { name: /Save and sign in/ }));
    await waitFor(() =>
      expect(handlers.command).toHaveBeenCalledWith({
        command: "save_credentials",
        connector: "facebook",
        credentials: { identifier: "taylor@example.org", password: "secret-pass" },
      }),
    );
    await screen.findByText(/Login saved and the agent is signed in to Facebook/);
  });

  it("locks autopilot commenting until the account has 14 days of history", () => {
    const fresh = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const { unmount } = render(
      <ConnectorList
        rows={{
          facebook: {
            connector: "facebook",
            method: "browser",
            status: "connected",
            account_label: "Org",
            detail: "",
            settings: {},
            connected_at: fresh,
            last_checked_at: fresh,
            updated_at: fresh,
          },
        }}
        events={[]}
        capabilities={{ browser: true, oauth: {} }}
        admin
        demo={false}
        live
        loadError=""
        actions={actions()}
        initialOpen="facebook"
      />,
    );
    expect(screen.getByRole("radio", { name: /Autopilot · locked/ })).toBeDisabled();
    unmount();
    render(<DemoConnectors />);
    fireEvent.click(screen.getByRole("button", { name: /^Facebook · Tucson Community Alliance/ }));
    expect(screen.getByRole("radio", { name: /Autopilot/ })).not.toBeDisabled();
    expect(screen.getByText(/Daily comment limit/)).toBeInTheDocument();
    expect(screen.getByText(/Pause at the first Facebook warning/)).toBeInTheDocument();
  });

  it("does not let organizers change connections", () => {
    render(
      <ConnectorList
        rows={{}}
        events={[]}
        capabilities={{ browser: true, oauth: {} }}
        admin={false}
        demo={false}
        live
        loadError=""
        actions={actions()}
      />,
    );
    expect(screen.getByText(/Only an organization owner or administrator/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Facebook Groups, community comments/ }));
    expect(screen.getByRole("button", { name: /Open agent browser/ })).toBeDisabled();
  });
});
