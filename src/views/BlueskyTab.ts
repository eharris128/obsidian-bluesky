import { ItemView, WorkspaceLeaf } from "obsidian";
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
        const limitedText = input.value.slice(0, this.MAX_CHARS);
        this.posts[index] = limitedText;
        
        if (input.value !== limitedText) {
            input.value = limitedText;
        }
        
        const counter = input.parentElement?.querySelector('.char-counter');
        if (counter) {
            counter.textContent = `${limitedText.length}/${this.MAX_CHARS}`;
        }

        // Update button states
        const addThreadBtn = this.containerEl.querySelector('.add-thread-btn') as HTMLButtonElement;
        if (addThreadBtn) {
            addThreadBtn.disabled = !this.posts[0]?.trim();
        }

        const postButton = this.containerEl.querySelector('.post-btn') as HTMLButtonElement;
        if (postButton) {
            const hasValidFirstPost = this.posts[0]?.trim().length > 0;
            const hasAnyContent = this.posts.some(post => post.trim());
            postButton.disabled = !hasValidFirstPost || !hasAnyContent;
        }
    }

    private addPost() {
        const index = this.posts.length;
        this.posts.push('');
        
        const container = this.containerEl.children[1];
        const buttonContainer = container.querySelector('.bluesky-buttons');
        
        // Create new post container
        const postContainer = container.createDiv({ cls: 'bluesky-compose' });
        
        // Insert before button container
        buttonContainer?.parentElement?.insertBefore(postContainer, buttonContainer);
        
        const textarea = postContainer.createEl("textarea", {
            attr: {
                placeholder: "Continue thread...",
                rows: "4",
                maxlength: this.MAX_CHARS.toString()
            },
            value: ''
        });
        textarea.addEventListener('input', (e) => this.handlePostChange(index, e));

        postContainer.createDiv({ 
            cls: 'char-counter',
            text: `0/${this.MAX_CHARS}`
        });

        const removeBtn = postContainer.createEl("button", { 
            cls: 'remove-post',
            text: "Remove Post"
        });
        removeBtn.addEventListener('click', () => this.removePost(index));
    }

    private removePost(index: number) {
        if (this.posts.length === 1) return;
        
        // Remove from data
        this.posts.splice(index, 1);
        
        // Remove from DOM
        const container = this.containerEl.children[1];
        const postContainers = container.querySelectorAll('.bluesky-compose');
        postContainers[index]?.remove();
    }

    private async publishContent() {
        if (this.isPosting) return;
        
        const validPosts = this.posts.filter(post => post.trim());
        if (!validPosts.length) return;
        
        try {
            this.isPosting = true;
            this.display();
            
            await this.bot.login();
            if (validPosts.length === 1) {
                await this.bot.createPost(validPosts[0]);
            } else {
                await this.bot.createThread(validPosts);
            }
            
            this.posts = [''];
        } catch (error) {
            console.error('Failed to post:', error);
        } finally {
            this.isPosting = false;
            this.display();
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
                    rows: "4",
                    maxlength: this.MAX_CHARS.toString()
                },
                value: post
            });
            textarea.addEventListener('input', (e) => this.handlePostChange(index, e));

            const counterDiv = postContainer.createDiv({ 
                cls: 'char-counter',
                text: `${post.length}/${this.MAX_CHARS}`
            });

            if (index > 0) {
                const removeBtn = postContainer.createEl("button", { 
                    cls: 'remove-post',
                    text: "Remove Post"
                });
                removeBtn.addEventListener('click', () => this.removePost(index));
            }
        });

        const buttonContainer = container.createDiv({ cls: "bluesky-buttons" });
        
        const leftButtons = buttonContainer.createDiv({ cls: "left-buttons" });
        const addThreadBtn = leftButtons.createEl("button", { 
            text: "Add to Thread",
            cls: 'add-thread-btn',
            attr: {
                'aria-label': 'Add text to your first post to start a thread'
            }
        });
        
        // Disable "Add to Thread" if first post is empty
        addThreadBtn.disabled = !this.posts[0]?.trim();
        addThreadBtn.addEventListener('click', () => this.addPost());

        if (this.posts.length > 1) {
            const removeBtn = leftButtons.createEl("button", { 
                cls: 'remove-post',
                text: "Remove Post"
            });
            removeBtn.addEventListener('click', () => this.removePost(this.posts.length - 1));
        }

        const postButton = buttonContainer.createEl("button", { 
            text: this.isPosting ? "Posting..." : "Post",
            cls: 'post-btn mod-primary'
        });
        
        const hasValidFirstPost = this.posts[0]?.trim().length > 0;
        const hasAnyContent = this.posts.some(post => post.trim());
        postButton.disabled = this.isPosting || !hasValidFirstPost || !hasAnyContent;
        
        postButton.addEventListener('click', () => this.publishContent());
    }
}
