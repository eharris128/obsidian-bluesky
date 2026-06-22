# Bluesky Plugin
- Post to Bluesky via a Tab view or by highlighting text

## Usage Guide

### Initial Setup
- Open the Bluesky plugin in the Obsidian settings.
- Enter your Bluesky handle (e.g. evanharris.bsky.social).
- Enter a Bluesky <b>App Password</b> - Note: Please do not enter your Bluesky password here.
    - If you do not have an App Password, you can create one by going to [the App Passwords page](https://bsky.app/settings/app-passwords) and creating a new App Password.

### How to Post

A new `megaphone` icon will appear in the left sidebar after you install the plugin.

- To compose a post or a thread: 
    - Click the `megaphone` icon to open a Bluesky tab.
    - Write your post or thread.
    - Click "Post" to post to Bluesky.
- If you prefer to use the command palette, you can run the `Open Bluesky tab` command.

## Network use & privacy

This plugin only contacts the network for the following, all initiated by you:

- **Bluesky (`bsky.social`)** - to authenticate with your App Password and to
  publish posts, threads, and uploaded images via the AT Protocol
  (`@atproto/api`). Your credentials are stored locally and sent only to Bluesky.
- **Link preview generation** - when your post includes a URL, the plugin fetches
  that URL (and its preview image) to build the embedded link card. This means it
  contacts whatever domain you linked to.

No telemetry or analytics are collected. The plugin makes no network requests
unless you post or include a link.

## Testing

```bash
npm run test:e2e
```

Runs provider-free UI smoke tests against a real, sandboxed Obsidian instance
via [wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service) —
no Bluesky credentials, no network calls, no contact with your real vault. See
[test/README.md](test/README.md) for details.

> [!WARNING]
> When touching the test config, never point `plugins:` in `wdio.conf.mts` at
> the repo root (`"."`). wdio-obsidian-service copies `data.json` — which holds
> your real Bluesky app password — from the plugin directory into every test
> vault. Always go through the staged copy in `test/plugin-dist/`
> (`scripts/stage-plugin.mjs`).

## Say Hi
- [Bluesky](https://bsky.app/profile/evanharris.bsky.social)

## Roadmap
- Media
- Embeds
- Posting threads from within a file
- Language specification

## Attribution

This project builds upon the [Bluesky AT Protocol](https://github.com/bluesky-social/atproto), which is licensed under the [MIT License](https://opensource.org/licenses/MIT).

The source code of this project includes parts of the Bluesky AT Protocol, following the MIT License requirements.
