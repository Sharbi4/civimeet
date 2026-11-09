# Run the saved CiviMeet builder agent

This launcher uses the user-supplied builder definition `agent_6af2277a03308191aefbc871a7cb5318` in OpenAI project `proj_YcAMhVhK4eAC6sEeJq2b5j0d`. Its name is **CiviMeet Community Organizer Agent Builder**. It uses GPT-6.1 Sol, medium reasoning with automatic summaries, medium text verbosity, live web search and the supplied multi-agent settings. The exact exported instructions are in `scripts/agents/builder.config.json`.

This is the engineering agent configured to build CiviMeet. Its engineering instructions are not substituted for Civi's customer-facing organizer personality or given access to customer organization memory. The saved definition itself is not modified. Session overrides preserve saved settings that are not explicitly overridden.

## Setup and run

Requires Node.js 22+, curl, and a project API key with Agents read/write and Responses write access. Put `OPENAI_API_KEY=...` in the ignored `.env.local`, or set that environment variable in your shell. Never use a consumer ChatGPT/Codex token. Lovable server secrets are separate and cannot be read by this local launcher.

```powershell
npm run agent:builder -- --dry-run
npm run agent:builder -- --message "Inspect your available environment and explain what repository access you need."
# Add the actual OpenAI-hosted computer-use tool and desktop:
npm run agent:builder -- --browser --message "Read example.com and report the page title. Do not sign in or change anything."
```

The second form adds `computer_use` to the supplied web-search tool list. Both use an OpenAI-hosted environment, with no local executor installation. An empty hosted environment does not automatically contain this repository: the agent must report missing repository access rather than pretend it edited local files. Source upload or a scoped repository integration is a separate setup step.

The launcher prints and saves the session ID under ignored `.civimeet-agent/`. Continue, inspect or stop that same session:

```powershell
npm run agent:builder -- --session SESSION_ID --message "Continue with the next step."
npm run agent:builder -- --session SESSION_ID --status
npm run agent:builder -- --session SESSION_ID --cancel
# Only after the provider requests this exact origin and you authorize it:
npm run agent:builder -- --session SESSION_ID --allow-origin https://example.com
```

All requests use shell-launched curl against the official Agents HTTP API, including the `OpenAI-Project` and `OpenAI-Beta: agents=v1` headers. The key goes to curl's stdin rather than its command line or a config file. JSON bodies use private temporary files; these are removed after each request. No automatic retries occur. Input submission IDs are saved; uncertain submissions should be inspected rather than sent twice.

The event subscription waits for real SSE response headers before sending the input. Text and event types are printed as they arrive. Only a terminal main-turn event confirms completion. HTTP failures report status/code/parameter without dumping credentials. Unknown function calls receive an explicit failed result; model arguments never execute arbitrary local commands. Browser origins require exact explicit approval. Secure login requests remain paused for a supported authentication UI; this CLI does not collect passwords or claim to offer interactive takeover. Closing the CLI does not imply that a cloud task stopped—use `--cancel` and verify with `--status`.

## Verification and current limits

- Syntax and credential-free configuration validation are runnable locally.
- The exported saved-agent ID, project, model, reasoning, text, and instruction contents are preserved.
- Live local curl execution is pending a local `OPENAI_API_KEY`; no key exists in the inspected process, user, machine, or project environment. The website's key is held separately by Lovable.
- Hosted-browser snapshots and authentication requests are different from a shared interactive browser viewer. The documented hosted API does not establish a live takeover URL; the existing Steel handoff remains separate and must not be labeled OpenAI-hosted takeover.
- The repository is not automatically available in the cloud environment. The launcher does not claim that the builder has edited or deployed it.

References: [Agents API](https://developers.openai.com/api/docs/guides/agents-api/overview), [sessions](https://developers.openai.com/api/docs/guides/agents-api/sessions), [events](https://developers.openai.com/api/docs/guides/agents-api/sessions/events), [computer use](https://developers.openai.com/api/docs/guides/agents-api/tools/computer-use).
