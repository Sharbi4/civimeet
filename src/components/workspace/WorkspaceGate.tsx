import { Fragment } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getDatabase } from "@/lib/database";
import { SignInForm } from "@/components/auth/SignInForm";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrowserScope } from "./BrowserDock";

type Membership = { role: string; organization: { id: string; name: string } };
import { WorkspaceContext, useWorkspace } from "./workspace-context";
export { useWorkspace };

export function WorkspaceGate({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const [db, setDb] = useState<SupabaseClient | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const database = getDatabase();
    setDb(database);
    if (!database) {
      setInitialized(true);
      return;
    }
    let alive = true;
    database.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!alive) return;
        setSession(data.session);
        if (failure) setError(failure.message);
        setInitialized(true);
      })
      .catch(() => {
        if (alive) {
          setError("Could not restore your session.");
          setInitialized(true);
        }
      });
    const { data } = database.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMemberships([]);
    setOrganizationId("");
    if (!db || !session?.user.id) return;
    let alive = true;
    setLoading(true);
    db.from("organization_members")
      .select("role, organization:organizations(id,name)")
      .eq("user_id", session.user.id)
      .then(({ data, error: failure }) => {
        if (!alive) return;
        setLoading(false);
        if (failure) {
          setError(failure.message);
          return;
        }
        const rows = (data ?? []) as unknown as Membership[];
        setMemberships(rows);
        let preferred = "";
        try {
          preferred = sessionStorage.getItem(`civimeet-organization:${session.user.id}`) ?? "";
        } catch {
          /* Storage may be disabled. */
        }
        setOrganizationId(
          rows.find((item) => item.organization.id === preferred)?.organization.id ??
            rows[0]?.organization.id ??
            "",
        );
      });
    return () => {
      alive = false;
    };
  }, [db, session?.user.id, reload]);

  async function createWorkspace() {
    if (!db) return;
    setLoading(true);
    setError("");
    const { error: failure } = await db.rpc("create_vendor_workspace", { workspace_name: name });
    setLoading(false);
    if (failure) setError(failure.message);
    else {
      setReload((value) => value + 1);
      setName("");
    }
  }

  const membership = memberships.find((item) => item.organization.id === organizationId);
  useBrowserScope(
    db && session && membership
      ? {
          db,
          organizationId,
          name: membership.organization.name,
          userId: session.user.id,
          role: membership.role,
        }
      : null,
  );
  const Layout = compact ? Fragment : SiteLayout;
  return (
    <Layout>
      <div className={compact && membership ? "organizer-gate" : ""}>
        <div className={compact && membership ? "" : "mx-auto max-w-6xl px-4 py-8"}>
          <div
            className={
              compact && membership
                ? "og-account"
                : "mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-5"
            }
          >
            <div>
              <p className="text-sm text-primary">CiviMeet organization workspace</p>
              <h1 className="text-2xl font-semibold">
                {membership?.organization.name ?? "Community Steward"}
              </h1>
            </div>
            {session && db && (
              <Button
                variant="outline"
                onClick={async () => {
                  const { error: failure } = await db.auth.signOut();
                  if (failure) setError(failure.message);
                }}
              >
                Sign out
              </Button>
            )}
          </div>
          {!initialized ? (
            <p role="status">Loading your workspace…</p>
          ) : !db ? (
            <div className="rounded-lg border p-6">
              <h2 className="font-semibold">Database connection needs configuration</h2>
              <p className="mt-2 text-muted-foreground">
                The organization workspace needs this project's public database URL and publishable
                key. Configure them in the hosting settings to enable sign-in and saved knowledge.
              </p>
            </div>
          ) : !session ? (
            <SignInForm db={db} />
          ) : loading ? (
            <p role="status">Loading organization…</p>
          ) : !membership ? (
            <form
              className="max-w-md space-y-4 rounded-lg border p-6"
              onSubmit={(e) => {
                e.preventDefault();
                void createWorkspace();
              }}
            >
              <h2 className="font-semibold">Create your organization workspace</h2>
              <p className="text-sm text-muted-foreground">
                Your vendor directory, shared knowledge, and platform agents will belong to this
                organization.
              </p>
              <Label htmlFor="workspace-name">Organization name</Label>
              <Input
                id="workspace-name"
                required
                minLength={2}
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button type="submit" disabled={loading}>
                Create workspace
              </Button>
            </form>
          ) : (
            <>
              <div className={compact ? "og-switch" : "mb-6 flex flex-wrap items-center gap-4"}>
                <Label htmlFor="organization-switch">Organization</Label>
                <select
                  id="organization-switch"
                  className="rounded-md border bg-background p-2"
                  value={organizationId}
                  onChange={(e) => {
                    setOrganizationId(e.target.value);
                    try {
                      sessionStorage.setItem(
                        `civimeet-organization:${session.user.id}`,
                        e.target.value,
                      );
                    } catch {
                      /* Storage may be disabled. */
                    }
                  }}
                >
                  {memberships.map((item) => (
                    <option key={item.organization.id} value={item.organization.id}>
                      {item.organization.name}
                    </option>
                  ))}
                </select>
                {compact && <button type="button" className="ml-auto text-xs text-slate-500" onClick={async () => { const r = await db.auth.signOut(); if (r.error) setError(r.error.message); }}>Sign out</button>}
                <nav
                  hidden={compact}
                  aria-label="Workspace"
                  className="flex flex-wrap gap-5 text-sm text-primary"
                >
                  <Link to="/dashboard">Dashboard</Link>
                  <Link to="/events">Gatherings</Link>
                  <Link to="/vendors">Vendors</Link>
                  <Link to="/platform-agents">Community channels</Link>
                  <Link to="/knowledge">Shared knowledge</Link>
                  <Link to="/analytics">Analytics</Link>
                </nav>
              </div>
              <WorkspaceContext.Provider value={{ db, organizationId, role: membership.role }}>
                <div key={organizationId} className={compact ? "organizer-frame" : undefined}>{children}</div>
              </WorkspaceContext.Provider>
            </>
          )}
          {error && (
            <p role="alert" className="mt-4 rounded-md border p-3 text-sm text-destructive">
              {error}{" "}
              <button
                className="underline"
                onClick={() => {
                  setError("");
                  setReload((value) => value + 1);
                }}
              >
                Retry
              </button>
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}
