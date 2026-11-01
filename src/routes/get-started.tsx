import { createFileRoute } from "@tanstack/react-router";
import { DemoRequestPage } from "@/components/site/DemoRequestPage";

export const Route = createFileRoute("/get-started")({
  head: () => ({ meta: [
    { title: "Request a Demo — CiviMeet" },
    { name: "description", content: "Request a CiviMeet demo for your organization and tell us about your community goals." },
    { property: "og:title", content: "Request a CiviMeet Demo" },
    { property: "og:description", content: "Connect with the CiviMeet team about your organization’s community goals." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: () => <DemoRequestPage source="get-started" />,
});