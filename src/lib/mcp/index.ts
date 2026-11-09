import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listOrganizations from "./tools/list-organizations";
import listGatherings from "./tools/list-gatherings";
import listVendors from "./tools/list-vendors";
import searchKnowledge from "./tools/search-knowledge";
import listApprovals from "./tools/list-approvals";
import listPaymentRequests from "./tools/list-payment-requests";
import listCommunityNeeds from "./tools/list-community-needs";
import listConnectedAccounts from "./tools/list-connected-accounts";
import recordCommunityNeed from "./tools/record-community-need";

// Vite inlines the stable ref; the published SUPABASE_URL may be a proxy.
const projectRef = import.meta.env["VITE_SUPABASE_PROJECT_ID"] ?? "project-ref-unset";

export default defineMcp({
  name: "civimeet",
  title: "CiviMeet",
  version: "0.1.0",
  instructions:
    "Tools for CiviMeet, the community organizing workspace. Each tool acts as the signed-in member and only sees organizations they belong to. Start with list_organizations, then pass organizationId when the member belongs to more than one. Read gatherings, vendors, shared knowledge, community needs, drafts awaiting review, payment requests and connected accounts; record new community needs. Nothing here publishes, sends messages or moves money: drafts wait for a person's approval and approved payments are not paid until a payment account confirms them.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
    requireOAuthClientClaim: true,
  }),
  tools: [
    listOrganizations,
    listGatherings,
    listVendors,
    searchKnowledge,
    listApprovals,
    listPaymentRequests,
    listCommunityNeeds,
    listConnectedAccounts,
    recordCommunityNeed,
  ],
});
