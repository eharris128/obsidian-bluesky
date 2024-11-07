import { ItemView, WorkspaceLeaf } from "obsidian";
import { BlueskyBot } from '@/bluesky';
import type MyPlugin from '@/main';

export const BLUESKY_SIDEBAR_VIEW = "bluesky-view";

export class BlueskySidebar extends ItemView {
    private plugin: MyPlugin;
    private bot: BlueskyBot;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.bot = new BlueskyBot(plugin);
        console.log("hai:", this.bot)
    }

    getViewType(): string {
        return BLUESKY_SIDEBAR_VIEW;
    }

    getDisplayText(): string {
        return "Bluesky";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: "Bluesky" });
        
        const contentEl = container.createDiv({ cls: "bluesky-content" });
        
        const composeArea = contentEl.createDiv({ cls: "bluesky-compose" });
        const textarea = composeArea.createEl("textarea", {
            attr: {
                placeholder: "What's on your mind?",
                rows: "4"
            }
        });
        
        const buttonContainer = composeArea.createDiv({ cls: "bluesky-buttons" });
        const postButton = buttonContainer.createEl("button", { text: "Post" });
        
        postButton.addEventListener("click", async () => {
            const text = textarea.value;
            if (!text) return;
            
            try {
                await this.bot.login();
                await this.bot.createPost(text);
                textarea.value = "";
            } catch (error) {
                console.error("Failed to post:", error);
            }
        });
    }

    async onClose() {
        // Cleanup
    }
} 