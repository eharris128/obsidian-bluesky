import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { createBlueskyPost } from '@/bluesky';
import { BlueskyTab } from '@/views/BlueskyTab';
import { BLUESKY_TITLE, VIEW_TYPE_TAB } from '@/consts';
import { setIcon } from "obsidian";

interface BlueskyPluginSettings {
    blueskyIdentifier: string;
    blueskyAppPassword: string;
}

const DEFAULT_SETTINGS: BlueskyPluginSettings = {
    blueskyIdentifier: '',
    blueskyAppPassword: ''
}

export default class BlueskyPlugin extends Plugin {
    settings: BlueskyPluginSettings;

    async activateBlueskyTab() {
        const { workspace } = this.app;
        
        // Create a new leaf in the main workspace area
        const leaf = workspace.getLeaf(true);
        
        // Set the view to the Bluesky tab
        await leaf.setViewState({
            type: VIEW_TYPE_TAB,
            active: true,
        });
    }

    async onload() {
        await this.loadSettings();

        // Add new command to post to Bluesky
        // In the onload() method, update the post-to-bluesky command:
        this.addCommand({
            id: 'post-to-bluesky',
            name: 'Post to Bluesky',
            editorCallback: async (editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText) {
                    new Notice('Please select some text to post');
                    return;
                }

                try {
                    await createBlueskyPost(this, selectedText);
                    new Notice('Successfully posted to Bluesky!');
                } catch (error) {
                    new Notice(`Failed to post: ${error.message}`);
                }
            }
        });
        
        this.registerView(
            VIEW_TYPE_TAB,
            (leaf) => new BlueskyTab(leaf, this)
        );

        this.addCommand({
            id: 'open-bluesky-tab',
            name: 'Open Bluesky Tab',
            callback: () => this.openTab()
        });

        // Add a ribbon icon to activate the view
        this.addRibbonIcon("megaphone", BLUESKY_TITLE, () => {
            this.activateBlueskyTab();
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new BlueskySettingTab(this.app, this));

    }

    onunload() {
        this.app.workspace.detachLeavesOfType(VIEW_TYPE_TAB);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async openTab() {
        const { workspace } = this.app;
        
        await workspace.getLeaf(true).setViewState({
            type: VIEW_TYPE_TAB,
            active: true
        });
    }

    addIcon(element: HTMLElement, iconId: string) {
        setIcon(element, iconId);
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

        containerEl.createEl('h3', { text: 'Bluesky Settings' });
        containerEl.createEl('p', {
            text: 'To get your app password:',
        });
        const steps = containerEl.createEl('ol');
        const li = steps.createEl('li');
        li.setText('Go to Bluesky App Passwords ');
        li.createEl('a', {
            text: 'page',
            href: 'https://bsky.app/settings/app-passwords'
        });
        steps.createEl('li', { text: 'Click "Add App Password"' });
        steps.createEl('li', { text: 'Give it a name (e.g. "Obsidian")' });
        steps.createEl('li', { text: 'Click "Create App Password"' });
        steps.createEl('li', { text: 'Copy the generated password' });

        new Setting(containerEl)
            .setName('Bluesky Identifier')
            .setDesc('Your Bluesky handle or email (required)')
            .addText(text => text
                .setPlaceholder('handle.bsky.social')
                .setValue(this.plugin.settings.blueskyIdentifier)
                .onChange(async (value) => {
                    this.plugin.settings.blueskyIdentifier = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Bluesky App Password')
            .setDesc('Your Bluesky app password (required)')
            .addText(text => text
                .setPlaceholder('Enter app password')
                .then(text => text.inputEl.type = 'password')
                .setValue(this.plugin.settings.blueskyAppPassword)
                .onChange(async (value) => {
                    this.plugin.settings.blueskyAppPassword = value;
                    await this.plugin.saveSettings();
                }));
    }
}
