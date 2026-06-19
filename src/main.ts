import { App, Editor, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { createBlueskyPost } from '@/bluesky';
import { ConfirmPostModal } from '@/modals/ConfirmPostModal';
import { BlueskyTab } from '@/views/BlueskyTab';
import { BLUESKY_TITLE, VIEW_TYPE_TAB } from '@/consts';
import { setIcon } from "obsidian";

interface BlueskyPluginSettings {
    blueskyIdentifier: string;
    blueskyAppPassword: string;
    postArchiveFolder: string;
    confirmBeforePosting: boolean;
}

const INITIAL_BLUESKY_SETTINGS: BlueskyPluginSettings = {
    blueskyIdentifier: '',
    blueskyAppPassword: '',
    postArchiveFolder: '',
    confirmBeforePosting: true
}

export default class BlueskyPlugin extends Plugin {
    settings: BlueskyPluginSettings;

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

        this.addCommand({
            id: 'post-to-bluesky',
            name: 'Post highlighted text',
            editorCallback: async (editor: Editor) => {
                const selectedText = editor.getSelection();
                if (!selectedText) {
                    new Notice('Please select some text to post');
                    return;
                }

                if (this.settings.confirmBeforePosting) {
                    new ConfirmPostModal(this.app, selectedText, () => {
                        void this.postHighlightedText(selectedText);
                    }).open();
                } else {
                    await this.postHighlightedText(selectedText);
                }
            }
        });
        
        this.registerView(
            VIEW_TYPE_TAB,
            (leaf) => new BlueskyTab(leaf, this)
        );

        this.addCommand({
            id: 'open-bluesky-tab',
            name: 'Open tab',
            callback: () => this.openTab()
        });

        this.addRibbonIcon("megaphone", BLUESKY_TITLE, () => {
            void this.activateBlueskyTab();
        });

        this.addSettingTab(new BlueskySettingTab(this.app, this));
    }

    async postHighlightedText(text: string) {
        try {
            await createBlueskyPost(this, text);
        } catch (error) {
            if (error.message.includes('Failed to fetch')) {
                new Notice('Failed to post. Could not connect to the internet.')
            } else if (error.message.includes('Invalid identifier or password')) {
                new Notice('Invalid bluesky handle or password. Please check your bluesky plugin settings.')
            } else {
                new Notice(`Failed to post: ${error.message}`);
            }
        }
    }

    async loadSettings() {
        this.settings = Object.assign({}, INITIAL_BLUESKY_SETTINGS, await this.loadData());
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
            .setName('Bluesky identifier')
            .setDesc('Your Bluesky handle or email (required)')
            .addText(text => text
                .setPlaceholder('handle.bsky.social')
                .setValue(this.plugin.settings.blueskyIdentifier)
                .onChange(async (value) => {
                    this.plugin.settings.blueskyIdentifier = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Bluesky app password')
            .setDesc('Your Bluesky app password (required)')
            .addText(text => text
                .setPlaceholder('Enter app password')
                .then(text => text.inputEl.type = 'password')
                .setValue(this.plugin.settings.blueskyAppPassword)
                .onChange(async (value) => {
                    this.plugin.settings.blueskyAppPassword = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Save posts to folder')
            .setDesc('Vault folder where a copy of each published post is saved, including a link to the post. Leave empty to disable.')
            .addText(text => text
                .setPlaceholder('e.g. Bluesky Posts')
                .setValue(this.plugin.settings.postArchiveFolder)
                .onChange(async (value) => {
                    this.plugin.settings.postArchiveFolder = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Confirm before posting')
            .setDesc('Show a preview of the highlighted text and ask for confirmation before posting it. Turn off to post immediately.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.confirmBeforePosting)
                .onChange(async (value) => {
                    this.plugin.settings.confirmBeforePosting = value;
                    await this.plugin.saveSettings();
                }));
    }
}
