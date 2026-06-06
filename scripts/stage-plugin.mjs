/**
 * Stage the built plugin into test/plugin-dist/ for the E2E suite.
 *
 * wdio-obsidian-service installs a plugin by copying manifest.json, main.js,
 * styles.css AND data.json (if present) from the plugin directory into the
 * sandboxed test vault. Pointing it at the repo root would therefore copy the
 * developer's real data.json (Bluesky identifier + app password) into every
 * test vault. Instead we stage a clean copy here with a deterministic empty
 * test data.json so runs are reproducible and never touch real credentials.
 *
 * Run `npm run build` first — this script copies the built main.js.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stageDir = path.join(repoRoot, "test", "plugin-dist");

mkdirSync(stageDir, { recursive: true });

for (const file of ["manifest.json", "main.js", "styles.css"]) {
	const src = path.join(repoRoot, file);
	if (!existsSync(src)) {
		console.error(`stage-plugin: missing ${file} — run \`npm run build\` first.`);
		process.exit(1);
	}
	copyFileSync(src, path.join(stageDir, file));
}

// Deterministic test settings: empty, so loadSettings() falls back entirely to
// INITIAL_BLUESKY_SETTINGS (no credentials, confirmBeforePosting: true). The
// suite never logs in or posts — Bluesky API coverage is out of scope.
writeFileSync(path.join(stageDir, "data.json"), "{}\n");

console.log(`stage-plugin: staged plugin into ${path.relative(repoRoot, stageDir)}`);
