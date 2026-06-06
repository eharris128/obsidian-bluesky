import * as fs from "fs";
import * as path from "path";

/**
 * Plugin id read from the staged manifest at runtime — never hardcode it in
 * specs, so the suite keeps working if the manifest id ever changes (or a
 * worktree carries a local-only id).
 */
const manifest = JSON.parse(
	fs.readFileSync(path.resolve("test/plugin-dist/manifest.json"), "utf-8")
) as { id: string };

export const PLUGIN_ID: string = manifest.id;

// Mirrors VIEW_TYPE_TAB in src/consts.ts (specs can't import src/ directly —
// it resolves the "obsidian" module, which only exists at runtime inside the
// app).
export const VIEW_TYPE_TAB = "bluesky-tab-view";

/** Commands the plugin registers unconditionally in src/main.ts. */
export const CORE_COMMANDS = [
	"post-to-bluesky",
	"open-bluesky-tab",
] as const;
