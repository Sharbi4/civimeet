<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Rules

- Analytics report analysis is editor-only and uses a user-scoped membership check, bounded CSV/JSON parsing, and a cancellable AI Gateway Responses stream; uploads/results remain transient unless users download results, avoiding unnecessary retention of analytics data.
- AI Gateway Responses helpers live in `src/lib/ai` with request-local gateway-issued run IDs and no automatic retries; analytics uses the shared helpers without changing the existing research provider.

- Google Analytics is initialized once in the root head using a validated public measurement ID from a server function; root navigation tracking sends pathname-only page views with automatic page views disabled to avoid duplicates and sensitive URL parameters.

- Web fonts are self-hosted as Lovable asset pointers (`.asset.json`) and declared with `@font-face` in `src/styles.css`; never add Google Fonts `<link>` tags or `@import` a remote font URL. Why: remote `@import` breaks the Lightning CSS build, and CDN-hosted pointers keep the repo lightweight while staying available on every deployment.
