import type { ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
// Compatibility for older views; the retired browser stack never mounts or executes.
type Scope = { db: SupabaseClient; organizationId: string; name: string; userId: string; role: string };
export function requestAgentBrowse(_request: { organizationId: string; url: string; task: string }) {}
export function PlatformBrowser(_props: { agentId: string }) { return null; }
export function useInlineBrowser() {}
export function useBrowserScope(_scope: Scope | null) {}
export function BrowserWorkspaceProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
