import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import brandFont from "@/assets/fonts/avenir-next-Regular.otf.asset.json";
import { BrowserWorkspaceProvider } from "@/components/workspace/BrowserDock";
import { getGoogleAnalyticsConfig } from "@/lib/google-analytics.functions";
import { googleTagBootstrap, trackGooglePageView } from "@/lib/google-analytics";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

type AnalyticsConfig = { measurementId: string | null };
let browserAnalyticsConfig: AnalyticsConfig | undefined;

// The root loader re-runs on every sign-in/sign-out. Analytics is optional, so a dropped
// request (network blip, preview restart) must never take the whole page down.
async function loadAnalyticsConfig(): Promise<AnalyticsConfig> {
  if (browserAnalyticsConfig) return browserAnalyticsConfig;
  try {
    const config = await getGoogleAnalyticsConfig();
    if (typeof window !== "undefined") browserAnalyticsConfig = config;
    return config;
  } catch (error) {
    console.warn("Analytics settings could not be loaded; continuing without analytics.", error);
    return { measurementId: null };
  }
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: loadAnalyticsConfig,
  head: ({ loaderData }) => ({
    scripts: loaderData?.measurementId ? [
      { children: googleTagBootstrap(loaderData.measurementId) },
      { src: `https://www.googletagmanager.com/gtag/js?id=${loaderData.measurementId}`, async: true },
    ] : [],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "CiviMeet" },
      { name: "description", content: "AI community organizers for civic organizations." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://civimeet.com/brand/civimeet-transparent.png" },
      { property: "og:image:alt", content: "CiviMeet" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/brand/civimeet-mark.svg", type: "image/svg+xml" },
      {
        rel: "preload",
        href: brandFont.url,
        as: "font",
        type: "font/otf",
        crossOrigin: "anonymous",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { measurementId } = Route.useLoaderData();
  const pathname = useLocation({ select: (location) => location.pathname });

  useEffect(() => {
    if (measurementId) trackGooglePageView(measurementId, pathname);
  }, [measurementId, pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <BrowserWorkspaceProvider>
        <Outlet />
      </BrowserWorkspaceProvider>
    </QueryClientProvider>
  );
}
