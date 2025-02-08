import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { BlueskyBot } from '@/bluesky';
import type BlueskyPlugin from '@/main';
import { BLUESKY_TITLE, VIEW_TYPE_TAB } from '@/consts';

export class BlueskyFeeds extends ItemView {
    private readonly plugin: BlueskyPlugin;
    private bot: BlueskyBot;

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
        return "apple";
    }

    async onOpen() {
        await this.display();
    }


    private async display() {
        const container = this.containerEl.children[1];
        container.empty();
        container.addClass('bluesky-feeds');
        
        container.createEl('h1', {
            text: 'Feeds'
        });

        // Show loading state
        const loadingEl = container.createDiv({ cls: 'bluesky-loading' });
        loadingEl.createSpan({ text: 'Loading feeds...' });
        
        try {
            const feedGenerators = await this.bot.getFeedGenerators();
            loadingEl.remove();

            for (const feed of feedGenerators.feeds) {
                const columnDiv = container.createDiv({ cls: 'bluesky-feed-column' });
                columnDiv.createEl('h2', { text: feed.displayName || 'Feed' });
                
                const feedData = await this.bot.getFeed(feed.uri);
                
                feedData.feed.forEach(async (post: any) => {
                    const postDiv = columnDiv.createDiv({ cls: 'bluesky-post' });
                    
                    const authorDiv = postDiv.createDiv({ cls: 'bluesky-post-author' });
                    authorDiv.createSpan({ 
                        text: post.post.author.displayName,
                        cls: 'display-name'
                    });
                    authorDiv.createSpan({ 
                        text: ` @${post.post.author.handle}`,
                        cls: 'handle'
                    });

                    postDiv.createDiv({ 
                        text: post.post.record.text,
                        cls: 'bluesky-post-content'
                    });

                    const footerDiv = postDiv.createDiv({ cls: 'bluesky-post-footer' });
                    
                    const date = new Date(post.post.indexedAt);
                    footerDiv.createDiv({ 
                        text: date.toLocaleString(),
                        cls: 'bluesky-post-date'
                    });

                    const likeButton = footerDiv.createEl('button', {
                        cls: 'bluesky-like-button',
                        text: '❤️'
                    });

                    // Check initial like status
                    const isLiked = await this.bot.isPostLiked(post.post.uri);
                    if (isLiked) {
                        likeButton.addClass('liked');
                    }

                    likeButton.addEventListener('click', async () => {
                        try {
                            await this.bot.likePost({
                                uri: post.post.uri,
                                cid: post.post.cid
                            });
                            
                            // Toggle liked state
                            const isCurrentlyLiked = likeButton.hasClass('liked');
                            if (isCurrentlyLiked) {
                                likeButton.removeClass('liked');
                            } else {
                                likeButton.addClass('liked');
                            }
                            new Notice(isCurrentlyLiked ? 'Post unliked!' : 'Post liked!');
                        } catch (error) {
                            new Notice('Failed to like/unlike post');
                        }
                    });
                });
            }
        } catch (error) {
            loadingEl.remove();
            container.createDiv({ 
                cls: 'bluesky-error',
                text: 'Failed to load feeds. Please try again later.'
            });
        }
    }
}