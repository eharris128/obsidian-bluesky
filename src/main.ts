import {
	App,
	Editor,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { createBlueskyPost } from "@/bluesky";
import { BlueskyTab } from "@/views/BlueskyTab";
import { BlueskyFeeds } from "@/views/BlueskyFeeds";
import { BLUESKY_TITLE, VIEW_TYPE_TAB, VIEW_TYPE_FEEDS } from "@/consts";
import { setIcon } from "obsidian";
import { getStyles, initMCPClient, client } from "./mcpClient";

interface BlueskyPluginSettings {
	blueskyIdentifier: string;
	blueskyAppPassword: string;
	discordWebhookUrl: string;
	enableDiscordNotifications: boolean;
	discordAvatarUrl: string;
	blockedWord: string;
}

interface MCPToolResult {
	content: Array<{
		type: string;
		text: string;
	}>;
}

const INITIAL_BLUESKY_SETTINGS: BlueskyPluginSettings = {
	blueskyIdentifier: "",
	blueskyAppPassword: "",
	discordWebhookUrl: "",
	enableDiscordNotifications: false,
	discordAvatarUrl:
		"https://cdn.bsky.app/img/avatar/plain/did:plc:z72i7hdynmk6r22z27h6tvur/bafkreih5cd5cta7zuysbsv5moihorugt6gnfwv43dhzrhhcx6wxgpxsph4@jpeg",
	blockedWord: "",
};

export default class BlueskyPlugin extends Plugin {
	settings: BlueskyPluginSettings;

	async activateBlueskyFeeds() {
		const { workspace } = this.app;

		const leaf = workspace.getLeaf(true);

		await leaf.setViewState({
			type: VIEW_TYPE_FEEDS,
			active: true,
		});
	}

	async activateBlueskyTab() {
		const { workspace } = this.app;

		const leaf = workspace.getLeaf(true);

		await leaf.setViewState({
			type: VIEW_TYPE_TAB,
			active: true,
		});
	}

	async onload() {
		await this.loadSettings();

		// Initialize MCP client first
		await initMCPClient();

		this.addCommand({
			id: "transform-text",
			name: "Transform text with styles",
			editorCallback: async (editor: Editor) => {
				const selectedText = editor.getSelection();
				if (!selectedText) {
					new Notice("Please select some text to transform");
					return;
				}

				try {
					const result = (await client.callTool({
						name: "transform",
						arguments: {
							style: this.settings.blockedWord,
							text: selectedText,
						},
					})) as MCPToolResult;
					console.log("result", result);

					if (result?.content?.[0]?.text) {
						// Replace the selected text with transformed version
						editor.replaceSelection(result.content[0].text);
						
						// Post the transformed text to platforms
						await this.post(result.content[0].text);
						
						new Notice("Text transformed and posted successfully");
					} else {
						new Notice("No transformation result received");
					}
				} catch (error) {
					console.error("Failed to transform text:", error);
					new Notice(`Failed to transform text: ${error.message}`);
				}
			},
		});

		this.addCommand({
			id: "post-to-bluesky",
			name: "Post highlighted text",
			editorCallback: async (editor: Editor) => {
				const selectedText = editor.getSelection();
				if (!selectedText) {
					new Notice("Please select some text to post");
					return;
				}

				try {
					await this.post(selectedText);
				} catch (error) {
					if (error.message.includes("Failed to fetch")) {
						new Notice(
							"Failed to post. Could not connect to the internet."
						);
					} else if (
						error.message.includes("Invalid identifier or password")
					) {
						new Notice(
							"Invalid bluesky handle or password. Please check your bluesky plugin settings."
						);
					} else {
						new Notice(`Failed to post: ${error.message}`);
					}
				}
			},
		});

		this.registerView(VIEW_TYPE_TAB, (leaf) => new BlueskyTab(leaf, this));

		this.registerView(
			VIEW_TYPE_FEEDS,
			(leaf) => new BlueskyFeeds(leaf, this)
		);

		this.addCommand({
			id: "open-bluesky-tab",
			name: "Open tab",
			callback: () => this.openTab(),
		});

		this.addCommand({
			id: "open-bluesky-feeds",
			name: "Open feeds",
			callback: () => this.openFeeds(),
		});

		this.addRibbonIcon("megaphone", BLUESKY_TITLE, () => {
			this.activateBlueskyTab();
		});

		this.addRibbonIcon("apple", BLUESKY_TITLE, () => {
			this.activateBlueskyFeeds();
		});

		this.addSettingTab(new BlueskySettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			INITIAL_BLUESKY_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openTab() {
		const { workspace } = this.app;

		await workspace.getLeaf(true).setViewState({
			type: VIEW_TYPE_TAB,
			active: true,
		});
	}

	async openFeeds() {
		const { workspace } = this.app;

		await workspace.getLeaf(true).setViewState({
			type: VIEW_TYPE_FEEDS,
			active: true,
		});
	}

	addIcon(element: HTMLElement, iconId: string) {
		setIcon(element, iconId);
	}

	// Helper function to apply styles to text
	applyStyles(text: string, styles: any): string {
		// Get the text from the styles
		if (styles?.contents?.[0]?.text) {
			return `${text} ${styles.contents[0].text}`;
		}
		// Fallback to original text if no style text is found
		return text;
	}

	async post(text: string) {
		try {
			// Post to both platforms
			const promises = [];

			// Post to Bluesky
			if (
				this.settings.blueskyIdentifier &&
				this.settings.blueskyAppPassword
			) {
				const blueskyStyles = getStyles("bluesky");
				if (blueskyStyles) {
					const blueskyText = this.applyStyles(text, blueskyStyles);
					promises.push(
						createBlueskyPost(this, blueskyText).catch((error) =>
							console.error("Failed to post to Bluesky:", error)
						)
					);
				}
			}

			// Post to Discord if enabled
			if (
				this.settings.enableDiscordNotifications &&
				this.settings.discordWebhookUrl
			) {
				const discordStyles = getStyles("discord");
				console.log(discordStyles);
				if (discordStyles) {
					const discordText = this.applyStyles(text, discordStyles);
					promises.push(
						this.postToDiscord(discordText).catch((error) =>
							console.error("Failed to post to Discord:", error)
						)
					);
				}
			}

			// Wait for all posts to complete
			await Promise.all(promises);
			new Notice("Posted successfully to all platforms");
		} catch (error) {
			console.error(`Failed to post:`, error);
			new Notice(`Failed to post: ${error.message}`);
		}
	}

	// Helper function to post to Discord
	async postToDiscord(text: string) {
		const { discordWebhookUrl, enableDiscordNotifications } = this.settings;

		if (!enableDiscordNotifications || !discordWebhookUrl) {
			return;
		}

		const response = await fetch(this.settings.discordWebhookUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				content: text,
				avatar_url: this.settings.discordAvatarUrl,
				username: "eharris128",
			}),
		});

		if (!response.ok) {
			throw new Error(`Discord API error: ${response.statusText}`);
		}
	}
}

class BlueskySettingTab extends PluginSettingTab {
	plugin: BlueskyPlugin;

	constructor(app: App, plugin: BlueskyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl("h2", { text: "Bluesky Settings" });

		new Setting(containerEl)
			.setName("Bluesky Handle")
			.setDesc("Your Bluesky handle (e.g., @example.bsky.social)")
			.addText((text) =>
				text
					.setPlaceholder("Enter your Bluesky handle")
					.setValue(this.plugin.settings.blueskyIdentifier)
					.onChange(async (value) => {
						this.plugin.settings.blueskyIdentifier = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Bluesky App Password")
			.setDesc("Your Bluesky app password")
			.addText((text) =>
				text
					.setPlaceholder("Enter your Bluesky app password")
					.setValue(this.plugin.settings.blueskyAppPassword)
					.onChange(async (value) => {
						this.plugin.settings.blueskyAppPassword = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Blocked Word")
			.setDesc("Word to be blocked in posts (used for transform)")
			.addText((text) =>
				text
					.setPlaceholder("Enter word to block")
					.setValue(this.plugin.settings.blockedWord)
					.onChange(async (value) => {
						this.plugin.settings.blockedWord = value;
						await this.plugin.saveSettings();
					})
			);

		containerEl.createEl("h3", { text: "Discord Integration" });

		new Setting(containerEl)
			.setName("Discord Webhook URL")
			.setDesc("Discord webhook URL for cross-posting (optional)")
			.addText((text) =>
				text
					.setPlaceholder("https://discord.com/api/webhooks/...")
					.setValue(this.plugin.settings.discordWebhookUrl)
					.onChange(async (value) => {
						this.plugin.settings.discordWebhookUrl = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Enable Discord notifications")
			.setDesc("Send posts to Discord when posting to Bluesky")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableDiscordNotifications)
					.onChange(async (value) => {
						this.plugin.settings.enableDiscordNotifications = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Discord Avatar URL")
			.setDesc(
				"URL for the avatar to use with Discord messages (optional)"
			)
			.addText((text) =>
				text
					.setPlaceholder("https://example.com/avatar.png")
					.setValue(this.plugin.settings.discordAvatarUrl)
					.onChange(async (value) => {
						this.plugin.settings.discordAvatarUrl = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
