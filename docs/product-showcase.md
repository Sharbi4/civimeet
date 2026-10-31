# Product showcase assets and behavior

The public `/product` page uses an isolated six-scene React demonstration. All example residents, resources, estimates, tasks, and outcomes are illustrative. The demo performs no network requests, authentication, browser sessions, messages, bookings, or payments. Manual scene selection pauses playback; playback stops on the final scene. Native buttons support keyboard interaction. Motion preferences disable visual animation and automatic startup is always off.

## Photography

Downloaded October 31, 2026 from Pexels at responsive 640px and 1280px widths. License checked at https://www.pexels.com/license/: free commercial use and modification; no implied endorsement. These are editorial stock scenes, not CiviMeet customers. Source links also appear on the page.

- `gathering-*`: https://www.pexels.com/photo/people-sitting-at-the-table-in-the-park-9655048/
- `conversation-*`: https://www.pexels.com/photo/a-group-of-people-discussing-notes-on-a-white-table-6592644/
- `garden-*`: Zack Gilbert, https://www.pexels.com/photo/community-gardening-project-in-bloomington-39778110/

Images are served locally; below-fold photography is lazy-loaded. Dimensional blue/ivory illustrations are lightweight CSS constructions with consistent Lucide silhouettes, without additional image downloads or runtime animation packages.

## Capability boundaries

Research, organization memory, planning records and controlled public-page browser snapshots reflect current capabilities. Social listening/publishing, private login/takeover, unattended execution, operational RSVPs, bookings and financial transactions are expressly identified as previews or in development. The static browser composition is labeled UI preview and has no pretend operational controls.

## Homepage

`/` reuses the same three local photos, `product.css` tokens/sculptures and `home.css` (`cmh-` prefix). Its mini demo, platform explorer and audience selector (`src/components/home/`) are local selection-only UI: no network calls, logins or messages. Platform statuses derive from `platform-playbooks.json`; only public-web supervised browsing is marked available.
