import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ConnectorList } from "@/components/workspace/Connectors";
import { useMemo, useState, type ComponentProps } from "react";
type Props = ComponentProps<typeof ConnectorList>;
type Row = Props["rows"][string];


globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver;

const actions = () => ({
  command: vi.fn(async () => ({ status: "connected" as const })),
  saveSettings: vi.fn(async () => {}),
});

const day = 86_400_000;
const sampleRows = (): Record<string, Row> => {
  const now = Date.now();
  const row = (
    connector: string,
    status: Row["status"],
    method: Row["method"],
    label: string,
    connectedDaysAgo: number | null,
    detail = "",
  ): Row => ({
    connector,
    status,
    method,
    account_label: label,
    detail,
    settings: {},
    connected_at:
      connectedDaysAgo === null ? null : new Date(now - connectedDaysAgo * day).toISOString(),
    last_checked_at: new Date(now - 6 * 60_000).toISOString(),
    updated_at: new Date(now - 6 * 60_000).toISOString(),
  });
  return {
    facebook: row("facebook", "connected", "browser", "Tucson Community Alliance", 21),
    instagram: row(
      "instagram",
      "needs_verification",
      "credentials",
      "tu•••",
      null,
      "Instagram wants to confirm it’s you. Finish the check in the live browser.",
    ),
    google_calendar: row("google_calendar", "connected", "oauth", "events@tucsonalliance.org", 9),
    eventbrite: row(
      "eventbrite",
      "saved",
      "credentials",
      "ev•••@tucsonalliance.org",
      null,
      "Login saved. Open the live browser once to finish the first sign-in.",
    ),
  };
};
function FixtureConnectors() {
  const [rows] = useState(sampleRows);
  const events = useMemo<Props["events"]>(
    () => [
      {
        id: "e1",
        connector: "facebook",
        action: "verified",
        message: "Agent confirmed it is still signed in",
        created_at: new Date(Date.now() - 6 * 60_000).toISOString(),
      },
      {
        id: "e2",
        connector: "instagram",
        action: "verification_needed",
        message: "Security check needed",
        created_at: new Date(Date.now() - 42 * 60_000).toISOString(),
      },
      {
        id: "e3",
        connector: "google_calendar",
        action: "oauth_connected",
        message: "Connected events@tucsonalliance.org",
        created_at: new Date(Date.now() - 9 * day).toISOString(),
      },
    ],
    [],
  );
  const actions = useMemo<Props["actions"]>(
    () => ({
      command: async () => ({
        message: "Fixture workspace.",
      }),
      saveSettings: async () => {},
    }),
    [],
  );
  return (
    <ConnectorList
      rows={rows}
      events={events}
      capabilities={{
        browser: true,
        oauth: {
          google: true,
          meta_pages: true,
          meta_instagram: true,
          linkedin: true,
          eventbrite: true,
          zoom: true,
        },
      }}
      admin
      live
      loadError=""
      actions={actions}
    />
  );
}


describe("Connections list", () => {
  it("lists platforms by group with live status instead of tiles", () => {
    render(<FixtureConnectors />);
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
        live
        loadError=""
        actions={actions()}
        initialOpen="facebook"
      />,
    );
    expect(screen.getByRole("radio", { name: /Autopilot · locked/ })).toBeDisabled();
    unmount();
    render(<FixtureConnectors />);
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
