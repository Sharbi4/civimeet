import { Body, Container, Head, Heading, Html, Preview, Text, Hr } from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface Props {
  name?: string;
  email?: string;
  organization?: string;
  organizationType?: string;
  message?: string;
}

function DemoRequestNotification({ name, email, organization, organizationType, message }: Props) {
  return <Html lang="en" dir="ltr">
    <Head />
    <Preview>A new community has requested a CiviMeet demo.</Preview>
    <Body style={body}>
      <Container style={container}>
        <Text style={brand}>CiviMeet</Text>
        <Heading>New demo request</Heading>
        <Text>A visitor has requested a demo. Their request is also saved for follow-up.</Text>
        <Hr />
        <Text><strong>Name:</strong> {name || "Not provided"}</Text>
        <Text><strong>Email:</strong> {email || "Not provided"}</Text>
        <Text><strong>Organization:</strong> {organization || "Not provided"}</Text>
        <Text><strong>Organization type:</strong> {organizationType || "Not provided"}</Text>
        <Text style={messageStyle}><strong>What they need:</strong><br />{message || "No additional message."}</Text>
        <Hr />
        <Text>Open Lovable Cloud → Database → demo_requests to review saved requests.</Text>
      </Container>
    </Body>
  </Html>;
}

export const template = {
  component: DemoRequestNotification,
  subject: "New CiviMeet demo request",
  displayName: "Demo request notification",
  to: "support@civimeet.com",
  previewData: { name: "Jane", email: "jane@example.org", organization: "Example Neighborhood Association", organizationType: "Neighborhood association", message: "We’d like to coordinate community gatherings." },
} satisfies TemplateEntry;

const body = { backgroundColor: "#ffffff", color: "#14231e", fontFamily: "Arial, sans-serif" };
const container = { maxWidth: "560px", padding: "32px 24px" };
const brand = { color: "#064cff", fontSize: "24px" };
const messageStyle = { whiteSpace: "pre-wrap" as const };