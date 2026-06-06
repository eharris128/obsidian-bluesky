import * as fs from "fs";
import * as path from "path";

// Override locally e.g.: OBSIDIAN_APP_VERSION=1.7.7 npm run test:e2e
// Don't use "earliest" — manifest.json's minAppVersion (0.15.0) is older than
// anything wdio-obsidian-service can download and run.
const appVersion = process.env.OBSIDIAN_APP_VERSION ?? "latest";
const installerVersion = process.env.OBSIDIAN_INSTALLER_VERSION ?? "latest";

// Reuse the sister repo's already-downloaded Obsidian cache (~150MB) when
// it's checked out next door; otherwise download into a local cache dir.
const sharedCache = path.resolve("../Obsidian-LLM-Plugin/.obsidian-cache");
const cacheDir = fs.existsSync(sharedCache) ? sharedCache : path.resolve(".obsidian-cache");

export const config: WebdriverIO.Config = {
	runner: "local",
	framework: "mocha",
	specs: ["./test/specs/**/*.e2e.ts"],
	// Each spec file gets its own sandboxed Obsidian instance; this many run in parallel.
	maxInstances: 4,

	capabilities: [
		{
			browserName: "obsidian",
			browserVersion: appVersion,
			"wdio:obsidianOptions": {
				installerVersion: installerVersion,
				// Staged by scripts/stage-plugin.mjs — never point this at "." or the
				// developer's real data.json (Bluesky app password) gets copied into
				// test vaults.
				plugins: ["./test/plugin-dist"],
				vault: "test/vaults/simple",
			},
		},
	],

	services: ["obsidian"],
	reporters: ["obsidian"],

	cacheDir: cacheDir,
	outputDir: "test/logs",

	mochaOpts: {
		ui: "bdd",
		timeout: 60000,
	},
	logLevel: "warn",
};
