# CiviMeet

AI community operations platform: Contribute → Connect → Meet Up.

The signed-in `/dashboard` is the chat-first organizer workspace. Explore the clearly labeled Tucson example at `/demo`. Community needs and full plan editing remain at `/planning`. See [workspace setup, integrations, and current availability](docs/organizer-workspace.md). See [steward workflow and configuration](docs/steward-dashboard.md) and the [research-informed implementation plan](docs/community-steward-plan.md).

## Perplexity research

The private research preview is available at `/agent`. Configure server secrets before use; see [Perplexity setup and current scope](docs/perplexity.md). Research is separate from the future autonomous organizer and does not publish or book anything.

## Organization and agent knowledge

The cloud database stores an organization-owned vendor directory, sourced discoveries, shared knowledge, private memory per platform agent, and independent worker queues. Open `/vendors`, `/knowledge`, or `/platform-agents` after signing in and creating an organization. See [database setup, isolation, and worker interface](docs/vendor-knowledge.md).

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9a24f5b-4404-44cc-8ddc-761a0a2ea28d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
