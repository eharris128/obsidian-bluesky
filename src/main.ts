import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { BLUESKY_SIDEBAR_VIEW, BlueskySidebar } from "@/views/BlueskySidebar";
import { BlueskyBot, createBlueskyPost } from '@/bluesky';

// Remember to rename these classes and interfaces!

interface MyPluginSettings {
    blueskyIdentifier: string;
    blueskyAppPassword: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
    blueskyIdentifier: '',
    blueskyAppPassword: ''
}

export default class MyPlugin extends Plugin {
    settings: MyPluginSettings;

    async activateView() {
        const { workspace } = this.app;

        let leaf = workspace.getLeavesOfType(BLUESKY_SIDEBAR_VIEW)[0];

        if (!leaf) {
            const newLeaf = workspace.getRightLeaf(false);
            if (!newLeaf) return; // Handle potential null
            leaf = newLeaf;
            await leaf.setViewState({
                type: BLUESKY_SIDEBAR_VIEW,
                active: true,
            }); 3
        }

        workspace.revealLeaf(leaf);
    }

    async onload() {
        await this.loadSettings();

        // This adds a status bar item to the bottom of the app. Does not work on mobile apps.
        const statusBarItemEl = this.addStatusBarItem();
        statusBarItemEl.setText('Status Bar Text');

        // This adds a simple command that can be triggered anywhere
        this.addCommand({
            id: 'open-sample-modal-simple',
            name: 'Open sample modal (simple)',
            callback: () => {
                new SampleModal(this.app).open();
            }
        });
        // This adds an editor command that can perform some operation on the current editor instance
        this.addCommand({
            id: 'sample-editor-command',
            name: 'Sample editor command',
            editorCallback: (editor: Editor, view: MarkdownView) => {
                console.log(editor.getSelection());
                editor.replaceSelection('Sample Editor Command');
            }
        });
        // This adds a complex command that can check whether the current state of the app allows execution of the command
        this.addCommand({
            id: 'open-sample-modal-complex',
            name: 'Open sample modal (complex)',
            checkCallback: (checking: boolean) => {
                // Conditions to check
                const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
                if (markdownView) {
                    // If checking is true, we're simply "checking" if the command can be run.
                    // If checking is false, then we want to actually perform the operation.
                    if (!checking) {
                        new SampleModal(this.app).open();
                    }

                    // This command will only show up in Command Palette when the check function returns true
                    return true;
                }
            }
        });

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
            BLUESKY_SIDEBAR_VIEW,
            (leaf) => new BlueskySidebar(leaf, this)
        );

        this.addCommand({
            id: 'open-bluesky-view',
            name: 'Open Bluesky View',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'open-bluesky-view',
            name: 'Open Bluesky View',
            callback: () => this.openTab()
        });

        // Add a ribbon icon to activate the view
        this.addRibbonIcon("message-square", "Bluesky", () => {
            this.activateView();
        });

        // This adds a settings tab so the user can configure various aspects of the plugin
        this.addSettingTab(new SampleSettingTab(this.app, this));

        // If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
        // Using this function will automatically remove the event listener when this plugin is disabled.
        this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
            console.log('click', evt);
        });

        // When registering intervals, this function will automatically clear the interval when the plugin is disabled.
        this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
    }

    onunload() {

    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}

class SampleModal extends Modal {
    constructor(app: App) {
        super(app);
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.setText('Woah!');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

class SampleSettingTab extends PluginSettingTab {
    plugin: MyPlugin;

    constructor(app: App, plugin: MyPlugin) {
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
