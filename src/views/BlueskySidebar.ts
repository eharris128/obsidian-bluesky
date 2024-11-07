import { ItemView, WorkspaceLeaf } from "obsidian";
import { BlueskyBot } from '@/bluesky';
import type MyPlugin from '@/main';
import { BLUESKY_TITLE, VIEW_TYPE_SIDEBAR } from '@/consts';

export class BlueskySidebar extends ItemView {
    private bot: BlueskyBot;

    constructor(leaf: WorkspaceLeaf, plugin: MyPlugin) {
        super(leaf);
        this.bot = new BlueskyBot(plugin);
    }

    getViewType(): string {
        return VIEW_TYPE_SIDEBAR;
    }

    getDisplayText(): string {
        return BLUESKY_TITLE;
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: BLUESKY_TITLE });
        
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