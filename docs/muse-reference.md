# Muse reference for CiviMeet

Reviewed October 31, 2026 using public first-party material. This is not an authenticated walkthrough; exact current button placement and private account screens have not been verified.

## Verified patterns

Muse describes a main conversation plus side chats, persistent memory, work triggered by schedules/events, activity and goals views, and selective notifications rather than constant status messages. Its design favors contextual outputs and explicit approval controls. Source: [How We Designed Muse](https://introducing.muse.ai/).

Its browser design separates credentials from model context and pauses agent actions during human control or credential injection. Permissions are enforced outside the agent. Source: [How We Built Safety Into Muse](https://research.meta.ai/blog/security-and-safety-for-ai-agents-our-approach-with-muse).

## CiviMeet design decisions

These are our proposed adaptations, not claims about Muse functionality:

| Surface | CiviMeet behavior | Current implementation |
| --- | --- | --- |
| Onboarding | Capture mission, area, coordinator, voice, channel responsibilities and gathering goals | Saved organization brief |
| Main conversation | Community Steward coordinates a shared community goal and routes work | Not yet built as a persistent coordinator chat |
| Platform conversations | Each platform has its own visible thread and contextual directions | Perplexity-backed planning turns with scoped history |
| Browser | Show the selected agent's actual work next to its conversation | Dock selects the platform; public-web navigation under live verification |
| Intervention | Explain why help is needed, offer takeover, then return to the checkpoint | Contextual controls implemented; private handoff remains gated |
| Login | Dedicated credential form, scoped vault, injection outside model context | Not yet implemented; never collect passwords in chat |
| Progress | Events, vendors and commitments appear as useful results with a clear next action | Brief-based next steps and draft planning records |
| Background work | Durable jobs, bounded retries and budgets, event-driven wakeups, meaningful notifications | Work queue exists; hosted autonomous coordinator not connected |

## Acceptance scenario

An organization sets a goal to organize a neighborhood gathering. The Steward prepares a plan, routes local vendor research to the web agent and draft community updates to the Facebook agent. Each reports evidence and pending decisions in its own conversation; the main conversation summarizes progress. A login challenge produces a focused secure-login request. Returning control resumes the same task without repeating a completed external action. Approvals bind to a specific destination and reviewed action. A stopped task stays stopped. No progress indicator may substitute for a real running worker.

The UI should show one relevant next step and reveal further detail on demand. Connected capabilities must be distinguished from planned capabilities, particularly Facebook Pages, groups, Messenger and channels.
