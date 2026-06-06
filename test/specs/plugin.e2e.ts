import { browser, expect } from "@wdio/globals";
import "wdio-obsidian-service";
import { CORE_COMMANDS, PLUGIN_ID, VIEW_TYPE_TAB } from "./helpers.js";

describe("plugin startup", function () {
	it("loads and enables the plugin", async function () {
		const loaded = await browser.executeObsidian(({ app }, pluginId) => {
			// app.plugins is an undocumented internal API
			const plugins = (app as any).plugins;
			return !!plugins.plugins[pluginId] && plugins.enabledPlugins.has(pluginId);
		}, PLUGIN_ID);
		expect(loaded).toBe(true);
	});

	it("registers its core commands", async function () {
		// Check the command registry, not listCommands() — the latter omits
		// editorCallback commands (post-to-bluesky) while no editor is active.
		const commandIds: string[] = await browser.executeObsidian(({ app }) =>
			Object.keys((app as any).commands.commands)
		);
		for (const cmd of CORE_COMMANDS) {
			expect(commandIds).toContain(`${PLUGIN_ID}:${cmd}`);
		}
	});

	it("registers the Bluesky tab view type", async function () {
		const registered = await browser.executeObsidian(({ app }, viewType) =>
			!!(app as any).viewRegistry.viewByType[viewType], VIEW_TYPE_TAB);
		expect(registered).toBe(true);
	});

	it("adds the megaphone ribbon icon", async function () {
		// addRibbonIcon("megaphone", BLUESKY_TITLE, ...) in src/main.ts
		const ribbonIcon = browser.$('.side-dock-ribbon-action[aria-label="Bluesky"]');
		await expect(ribbonIcon).toExist();
	});

	it("shows the plugin settings tab with its four settings", async function () {
		await browser.executeObsidian(({ app }, pluginId) => {
			const setting = (app as any).setting;
			setting.open();
			setting.openTabById(pluginId);
		}, PLUGIN_ID);

		const settingNames = await browser
			.$$(".vertical-tab-content .setting-item-name")
			.map((el) => el.getText());
		// Mirrors BlueskySettingTab.display() in src/main.ts
		for (const name of [
			"Bluesky identifier",
			"Bluesky app password",
			"Save posts to folder",
			"Confirm before posting",
		]) {
			expect(settingNames).toContain(name);
		}

		await browser.keys("Escape");
		await expect(browser.$(".modal-container")).not.toExist();
	});
});
