import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { getDatabase } from "@/lib/database";
import { lovable } from "@/integrations/lovable";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBrowserScope } from "./BrowserDock";

type Membership = { role: string; organization: { id: string; name: string } };
type Workspace = { db: SupabaseClient; organizationId: string; role: string };
const WorkspaceContext = createContext<Workspace | null>(null);
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("A signed-in organization workspace is required.");
  return value;
}

export function WorkspaceGate({
  children,
  initialSignup = false,
}: {
  children: ReactNode;
  initialSignup?: boolean;
}) {
  const [db, setDb] = useState<SupabaseClient | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signup, setSignup] = useState(initialSignup);
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
      setPassword("");
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

  async function authenticate() {
    if (!db) return;
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const { data, error: failure } = signup
        ? await db.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth` },
          })
        : await db.auth.signInWithPassword({ email, password });
      if (failure) throw failure;
      if (!data.session) setNotice("Check your email to confirm your account, then sign in.");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not sign in.");
    } finally {
      setLoading(false);
    }
  }

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
  return (
    <SiteLayout>
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b pb-5">
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
          <form
            className="mx-auto max-w-md space-y-4 rounded-lg border p-6"
            onSubmit={(e) => {
              e.preventDefault();
              void authenticate();
            }}
          >
            <h2 className="text-xl font-semibold">
              {signup ? "Create your account" : "Sign in to your organization"}
            </h2>
            <div className="grid gap-2">
              {(["google", "lovable"] as const).map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  disabled={loading}
                  onClick={async () => {
                    setError("");
                    const result = await lovable.auth.signInWithOAuth(provider, {
                      redirect_uri: `${window.location.origin}/auth`,
                    });
                    if (result.error) setError(result.error.message);
                  }}
                >
                  Continue with {provider === "google" ? "Google" : "Lovable"}
                </Button>
              ))}
            </div>
            <p className="text-center text-xs text-muted-foreground">or use email</p>
            <div className="space-y-2">
              <Label htmlFor="workspace-email">Email</Label>
              <Input
                id="workspace-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="workspace-password">Password</Label>
              <Input
                id="workspace-password"
                type="password"
                minLength={8}
                required
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <Button disabled={loading} type="submit">
              {loading ? "Please wait…" : signup ? "Create account" : "Sign in"}
            </Button>
            <Button type="button" variant="link" onClick={() => setSignup(!signup)}>
              {signup ? "Already have an account?" : "Create an account"}
            </Button>
            {notice && (
              <p role="status" className="text-sm">
                {notice}
              </p>
            )}
          </form>
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
            <div className="mb-6 flex flex-wrap items-center gap-4">
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
              <nav aria-label="Workspace" className="flex flex-wrap gap-5 text-sm text-primary">
                <Link to="/dashboard">Dashboard</Link>
                <Link to="/events">Gatherings</Link>
                <Link to="/vendors">Vendors</Link>
                <Link to="/platform-agents">Community channels</Link>
                <Link to="/knowledge">Shared knowledge</Link>
              </nav>
            </div>
            <WorkspaceContext.Provider value={{ db, organizationId, role: membership.role }}>
              <div key={organizationId}>{children}</div>
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
    </SiteLayout>
  );
}
