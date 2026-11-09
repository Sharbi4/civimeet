import { createContext, useContext, type Context } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Workspace = { db: SupabaseClient; organizationId: string; role: string };

// Keep one context object for the whole page. When the workspace screens are hot-reloaded,
// a freshly created context would leave already-rendered children reading a different
// (empty) provider and crash the dashboard with "workspace is required".
const globalKey = "__civimeetWorkspaceContext" as const;
type GlobalWithContext = typeof globalThis & {
  [globalKey]?: Context<Workspace | null>;
};
const store = globalThis as GlobalWithContext;

export const WorkspaceContext: Context<Workspace | null> =
  store[globalKey] ?? (store[globalKey] = createContext<Workspace | null>(null));

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("A signed-in organization workspace is required.");
  return value;
}
