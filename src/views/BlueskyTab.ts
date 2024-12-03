import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { BlueskyBot } from '@/bluesky';
import type BlueskyPlugin from '@/main';
import { BLUESKY_TITLE, VIEW_TYPE_TAB } from '@/consts';

export class BlueskyTab extends ItemView {
    private readonly plugin: BlueskyPlugin;
    private bot: BlueskyBot;
    private posts: string[] = [''];
    private isPosting: boolean = false;
    private readonly MAX_CHARS = 300;

    constructor(leaf: WorkspaceLeaf, plugin: BlueskyPlugin) {
        super(leaf);
        this.plugin = plugin;
        this.bot = new BlueskyBot(plugin);
    }

    getViewType(): string {
        return VIEW_TYPE_TAB;
    }

    getDisplayText(): string {
        return BLUESKY_TITLE;
    }

    getIcon(): string {
        return "megaphone";
    }

    private handlePostChange(index: number, event: Event) {
        const input = event.target as HTMLTextAreaElement;
        this.posts[index] = input.value;

        const counter = input.parentElement?.querySelector('.bluesky-char-counter');
        if (counter) {
            counter.textContent = `${input.value.length}/${this.MAX_CHARS}`;
            if (input.value.length > this.MAX_CHARS) {
                counter.classList.add('exceeded');
            } else {
                counter.classList.remove('exceeded');
            }
        }

        this.updateButtonStates();
    }

    private updateButtonStates() {
        const addThreadBtn = this.containerEl.querySelector('.add-bluesky-thread-btn') as HTMLButtonElement;
        if (addThreadBtn) {
            addThreadBtn.disabled = !this.posts[0]?.trim();
        }

        const postButton = this.containerEl.querySelector('.bluesky-post-btn') as HTMLButtonElement;
        if (postButton) {
            const hasValidFirstPost = this.posts[0]?.trim().length > 0;
            const hasAnyContent = this.posts.some(post => post.trim());
            const isExceeded = this.posts.some(post => post.length > this.MAX_CHARS);
            postButton.disabled = !hasValidFirstPost || !hasAnyContent || isExceeded;
        }
    }

    private addPost() {
        const index = this.posts.length;
        this.posts.push('');

        const container = this.containerEl.children[1];
        const buttonContainer = container.querySelector('.bluesky-buttons');

        const postContainer = container.createDiv({ cls: 'bluesky-compose' });
        buttonContainer?.parentElement?.insertBefore(postContainer, buttonContainer);

        const closeBtn = postContainer.createEl("button", {
            cls: 'bluesky-close-post',
            attr: {
                'aria-label': 'Remove this post from the thread'
            }
        });
        this.plugin.addIcon(closeBtn, 'lucide-x');
        closeBtn.addEventListener('click', () => this.removePost(index));

        const textarea = postContainer.createEl("textarea", {
            attr: {
                placeholder: "Continue thread...",
                rows: "4"
            },
            value: ''
        });
        textarea.addEventListener('input', (e) => this.handlePostChange(index, e));

        postContainer.createDiv({
            cls: 'bluesky-char-counter',
            text: `0/${this.MAX_CHARS}`
        });

        this.updateButtonStates();
    }

    private removePost(index: number) {
        if (this.posts.length === 1) return;

        this.posts.splice(index, 1);

        const container = this.containerEl.children[1];
        const postContainers = container.querySelectorAll('.bluesky-compose');
        postContainers[index]?.remove();

        this.updateButtonStates();
    }

    private async publishContent() {
        if (this.isPosting) return;

        const validPosts = this.posts.filter(post => post.trim());
        if (!validPosts.length) return;
        let success = false
        try {
            this.isPosting = true;
            await this.bot.login();
            if (validPosts.length === 1) {
                success = await this.bot.createPost(validPosts[0]);
            } else {
                success = await this.bot.createThread(validPosts);
            }
3
            this.posts = [''];
        } catch (error) {
            console.error('Failed to post:', error);
            if (error.message.includes('Failed to fetch')) {
                new Notice('Failed to post. Could not connect to the internet.')
            }
        } finally {
            this.isPosting = false;
            if (success) this.display();
        }
    }

    async onOpen() {
        this.display();
    }

    private display() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('bluesky-content');

        container.createEl("h4", { text: "Bluesky" });

        this.posts.forEach((post, index) => {
            const postContainer = container.createDiv({ cls: 'bluesky-compose' });

            const textarea = postContainer.createEl("textarea", {
                attr: {
                    placeholder: index === 0 ? "What's on your mind?" : "Continue thread...",
                    rows: "4"
                },
                value: post
            });
            textarea.addEventListener('input', (e) => this.handlePostChange(index, e));

            postContainer.createDiv({
                cls: 'bluesky-char-counter',
                text: `${post.length}/${this.MAX_CHARS}`
            });
        });

        const buttonContainer = container.createDiv({ cls: "bluesky-buttons" });

        const leftButtons = buttonContainer.createDiv({ cls: "bluesky-left-buttons" });
        const addThreadBtn = leftButtons.createEl("button", {
            text: "Add to thread",
            cls: 'add-bluesky-thread-btn',
            attr: {
                'aria-label': 'Add text to your first post to start a thread'
            }
        });

        addThreadBtn.addEventListener('click', () => this.addPost());

        const postButton = buttonContainer.createEl("button", {
            text: this.isPosting ? "Posting..." : "Post",
            cls: 'bluesky-post-btn mod-primary'
        });

        postButton.addEventListener('click', () => this.publishContent());

        this.updateButtonStates();
    }
}