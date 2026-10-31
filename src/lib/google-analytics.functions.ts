import { createServerFn } from "@tanstack/react-start";

// A GA measurement ID is intentionally public; no other credentials leave this handler.
export const getGoogleAnalyticsConfig = createServerFn({ method: "GET" }).handler(() => {
  const measurementId = process.env["GOOGLE_ANALYTICS_MEASUREMENT_ID"]?.trim();
  return { measurementId: measurementId && /^G-[A-Z0-9]+$/.test(measurementId) ? measurementId : null };
});