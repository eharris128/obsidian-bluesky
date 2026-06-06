# E2E Test Suite

End-to-end tests that drive a **real, sandboxed Obsidian instance** via
[wdio-obsidian-service](https://github.com/jesse-r-s-hines/wdio-obsidian-service).
Nothing here touches your real vault, config, or `data.json`, and no spec ever
talks to Bluesky — the staged test settings contain no credentials.

```bash
npm run test:e2e
```

The first run downloads Obsidian (~150 MB). `wdio.conf.mts` reuses the sister
repo's `../Obsidian-LLM-Plugin/.obsidian-cache/` when present, otherwise it
downloads into a local `.obsidian-cache/` (gitignored). Pin versions with env
vars:

```bash
OBSIDIAN_APP_VERSION=1.7.7 OBSIDIAN_INSTALLER_VERSION=1.7.7 npm run test:e2e
```

Do **not** use `OBSIDIAN_APP_VERSION=earliest` — this plugin's `minAppVersion`
is 0.15.0, far older than anything wdio-obsidian-service can download and run.

## Layout

| Path | Purpose |
|------|---------|
| `wdio.conf.mts` (repo root) | WebdriverIO config — one sandboxed Obsidian per spec file, up to 4 in parallel |
| `scripts/stage-plugin.mjs` | Copies `manifest.json` + `main.js` + `styles.css` into `test/plugin-dist/` with an empty test `data.json` |
| `test/plugin-dist/` | Staged plugin installed into test vaults (gitignored) |
| `test/vaults/simple/` | Default test vault, copied fresh per run |
| `test/specs/*.e2e.ts` | Mocha specs (own `test/tsconfig.json`, type-checked by `test:e2e`) |
| `test/logs/` | wdio logs (gitignored) |

## Conventions

- **Never pass `plugins: ["."]` in `wdio.conf.mts`.** The service copies
  `data.json` from the plugin dir into test vaults — pointing at the repo root
  would leak the developer's real Bluesky identifier and app password into
  every sandbox vault. Always go through `test/plugin-dist/`.
- **Never hardcode the plugin id.** Read it via `PLUGIN_ID` from
  `test/specs/helpers.ts`, which loads it from the staged manifest.
- **Specs must never hit the network.** Two plugin paths reach out to the
  internet and must be avoided:
  - `BlueskyTab.handleEditorChange` fetches link metadata whenever the compose
    editor's text contains a URL — keep typed test text URL-free.
  - Submitting the "Insert link" modal (Insert button / Enter) fetches metadata
    for the new link — specs close it with Escape only.
  The `ConfirmPostModal` preview, by contrast, is fully offline (it uses
  `RichText.detectFacetsWithoutResolution`), so markdown/bare-link highlighting
  *is* safely testable there.
- **Never confirm a post.** Clicking "Post" anywhere would attempt a Bluesky
  login. It fails fast on the empty test credentials, but it's still out of
  scope — specs only assert modal structure and then Escape/Cancel.
- Each spec file gets its own Obsidian instance, but tests within a file share
  state — clean up leaves/modals/notices in `beforeEach`/`afterEach` hooks.

## Follow-ups (out of scope for this suite)

Anything requiring Bluesky auth or network: login, posting, threads, link
metadata fetching, image upload, post archiving after a successful post. These
could be covered later against a local fake PDS / XRPC server (e.g. an
`http://localhost` service URL injected via the staged `data.json` plus a
stubbed `requestUrl`).
