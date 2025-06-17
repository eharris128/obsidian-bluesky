import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { BlueskyBot } from '@/bluesky';
import type BlueskyPlugin from '@/main';
import { BLUESKY_TITLE, VIEW_TYPE_TAB } from '@/consts';
import { LinkModal } from '@/modals/LinkModal';

export class BlueskyTab extends ItemView {
    private readonly plugin: BlueskyPlugin;
    private bot: BlueskyBot;
    private posts: string[] = [''];
    private isPosting: boolean = false;
    private readonly MAX_CHARS = 300;
    private linkMetadata: Map<number, any> = new Map(); // Track metadata per post index
    private linkPreviewEls: Map<number, HTMLElement> = new Map(); // Track preview elements per post
    private linkRanges: Array<{start: number, end: number, url: string, text: string}> = [];

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

    private handleEditorChange(index: number, event: Event) {
        const editor = event.target as HTMLElement;
        
        // First, fix any links that have been extended by typing
        this.fixExtendedLinks(editor);
        
        const text = this.getEditorText(editor);
        this.posts[index] = text;

        const counter = editor.parentElement?.querySelector('.bluesky-char-counter');
        if (counter) {
            counter.textContent = `${text.length}/${this.MAX_CHARS}`;
            if (text.length > this.MAX_CHARS) {
                counter.classList.add('exceeded');
            } else {
                counter.classList.remove('exceeded');
            }
        }

        // Detect and preview links for any post in the thread
        this.detectAndPreviewLink(text, true, index);

        this.updateButtonStates();
    }

    private fixExtendedLinks(editor: HTMLElement) {
        const linkElements = editor.querySelectorAll('.bluesky-link');
        
        linkElements.forEach(linkElement => {
            const originalText = linkElement.getAttribute('data-original-text');
            const currentText = linkElement.textContent || '';
            
            // If we don't have the original text stored, store it now
            if (!originalText) {
                linkElement.setAttribute('data-original-text', currentText);
                return;
            }
            
            // If text has been added to the link, extract the extra text
            if (currentText.length > originalText.length && currentText.startsWith(originalText)) {
                const extraText = currentText.substring(originalText.length);
                
                // Restore the link to its original text
                linkElement.textContent = originalText;
                
                // Create a text node for the extra text and insert it after the link
                const textNode = document.createTextNode(extraText);
                if (linkElement.nextSibling) {
                    linkElement.parentNode?.insertBefore(textNode, linkElement.nextSibling);
                } else {
                    linkElement.parentNode?.appendChild(textNode);
                }
                
                // Move cursor to the end of the new text
                const selection = window.getSelection();
                if (selection) {
                    const range = document.createRange();
                    range.setStart(textNode, textNode.textContent?.length || 0);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }
            }
        });
    }

    private getEditorText(editor: HTMLElement): string {
        return editor.textContent || '';
    }

    private extractLinksFromEditor(editor: HTMLElement): Array<{start: number, end: number, url: string, text: string}> {
        const links: Array<{start: number, end: number, url: string, text: string}> = [];
        const text = this.getEditorText(editor);
        const linkElements = editor.querySelectorAll('.bluesky-link');
        
        linkElements.forEach(linkEl => {
            const linkText = linkEl.textContent || '';
            const url = linkEl.getAttribute('data-url') || '';
            
            if (linkText && url) {
                const start = text.indexOf(linkText);
                if (start !== -1) {
                    links.push({
                        start: start,
                        end: start + linkText.length,
                        url: url,
                        text: linkText
                    });
                }
            }
        });
        
        return links;
    }

    private handlePaste(event: ClipboardEvent) {
        event.preventDefault();
        const text = event.clipboardData?.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
    }

    private async detectAndPreviewLink(text: string, preserveManualLinks = false, postIndex = 0) {
        // Find the specific editor for this post
        const editors = this.containerEl.querySelectorAll('.bluesky-editor');
        const editor = editors[postIndex] as HTMLElement;
        
        if (!editor) return;
        
        const hasManualLinks = editor.querySelectorAll('.bluesky-link').length > 0;
        const existingMetadata = this.linkMetadata.get(postIndex);
        const existingPreviewEl = this.linkPreviewEls.get(postIndex);
        
        // If we have manual links and should preserve them, keep existing preview
        if (preserveManualLinks && hasManualLinks && existingMetadata) {
            return; // Don't change existing preview when typing with manual links
        }
        
        // Check for URLs in both plain text and manual links
        let url = typeof text === 'string' && text.startsWith('http') ? text : this.bot.extractFirstUrl(text);
        
        // If no URL found in plain text, check manual links
        if (!url && hasManualLinks) {
            const firstLink = editor.querySelector('.bluesky-link');
            if (firstLink) {
                url = firstLink.getAttribute('data-url');
            }
        }
        
        // Only remove preview if no URL found anywhere and no manual links
        if (!url && existingPreviewEl && !hasManualLinks) {
            existingPreviewEl.remove();
            this.linkPreviewEls.delete(postIndex);
            this.linkMetadata.delete(postIndex);
            return;
        }

        // If we have an existing preview for the same URL, keep it
        if (url && existingMetadata && existingMetadata.url === url) {
            return; // Keep existing preview for same URL
        }

        if (url && (!existingMetadata || existingMetadata.url !== url)) {
            try {
                if (existingPreviewEl) {
                    existingPreviewEl.addClass('loading');
                }

                const metadata = await this.bot.fetchLinkMetadata(url);
                
                if (metadata) {
                    this.linkMetadata.set(postIndex, metadata);
                    this.showLinkPreview(metadata, postIndex);
                } else {
                    // If metadata fetch failed, remove any existing preview only if no manual links
                    if (existingPreviewEl && !hasManualLinks) {
                        existingPreviewEl.remove();
                        this.linkPreviewEls.delete(postIndex);
                        this.linkMetadata.delete(postIndex);
                    }
                }
            } catch (error) {
                console.warn('Error fetching link preview:', error);
                if (existingPreviewEl && !hasManualLinks) {
                    existingPreviewEl.remove();
                    this.linkPreviewEls.delete(postIndex);
                    this.linkMetadata.delete(postIndex);
                }
            }
        }
    }

    private showLinkPreview(metadata: any, postIndex = 0) {
        // Find the specific container for this post
        const containers = this.containerEl.querySelectorAll('.bluesky-compose');
        const container = containers[postIndex] as HTMLElement;
        if (!container) return;

        // Remove existing preview for this post
        const existingPreviewEl = this.linkPreviewEls.get(postIndex);
        if (existingPreviewEl) {
            existingPreviewEl.remove();
        }

        const linkPreviewEl = container.createDiv({ cls: 'bluesky-link-preview' });
        this.linkPreviewEls.set(postIndex, linkPreviewEl);
        
        const previewContent = linkPreviewEl.createDiv({ cls: 'bluesky-link-preview-content' });
        
        if (metadata.image) {
            previewContent.createEl('img', {
                cls: 'bluesky-link-preview-image',
                attr: { src: metadata.image }
            });
        }
        
        const textContent = previewContent.createDiv({ cls: 'bluesky-link-preview-text' });
        textContent.createEl('div', {
            cls: 'bluesky-link-preview-title',
            text: metadata.title
        });
        
        if (metadata.description) {
            textContent.createEl('div', {
                cls: 'bluesky-link-preview-description',
                text: metadata.description
            });
        }
        
        textContent.createEl('div', {
            cls: 'bluesky-link-preview-url',
            text: new URL(metadata.url).hostname
        });

        const removeBtn = linkPreviewEl.createEl('button', {
            cls: 'bluesky-link-preview-remove',
            attr: { 'aria-label': 'Remove link preview' }
        });
        this.plugin.addIcon(removeBtn, 'lucide-x');
        removeBtn.addEventListener('click', () => {
            this.linkMetadata.delete(postIndex);
            linkPreviewEl.remove();
            this.linkPreviewEls.delete(postIndex);
        });
    }

    private applyLinkStyling(textarea: HTMLTextAreaElement) {
        // Add a visual indicator by changing the textarea's styling
        // We'll add a CSS class and use a data attribute to track linked ranges
        textarea.addClass('has-links');
        
        // Store link ranges as data attribute for CSS styling reference
        textarea.setAttribute('data-link-ranges', JSON.stringify(this.linkRanges));
        
        // Add a subtle visual indicator next to the textarea
        this.showLinkIndicators(textarea);
    }

    private showLinkIndicators(textarea: HTMLTextAreaElement) {
        const container = textarea.parentElement;
        if (!container) return;

        // Remove existing indicators
        container.querySelectorAll('.bluesky-link-indicator').forEach(el => el.remove());

        // Add indicators for each link
        this.linkRanges.forEach((range, index) => {
            const indicator = container.createDiv({ cls: 'bluesky-link-indicator' });
            indicator.textContent = `🔗 "${range.text}" → ${new URL(range.url).hostname}`;
            
            // Add remove button for each link
            const removeBtn = indicator.createEl('button', {
                cls: 'bluesky-link-indicator-remove',
                text: '×',
                attr: { 'aria-label': `Remove link from "${range.text}"` }
            });
            
            removeBtn.addEventListener('click', () => {
                this.removeLinkRange(index, textarea);
            });
        });
    }

    private removeLinkRange(index: number, textarea: HTMLTextAreaElement) {
        const removedRange = this.linkRanges.splice(index, 1)[0];
        
        if (this.linkRanges.length === 0) {
            textarea.removeClass('has-links');
            textarea.removeAttribute('data-link-ranges');
        } else {
            textarea.setAttribute('data-link-ranges', JSON.stringify(this.linkRanges));
        }
        
        this.showLinkIndicators(textarea);
        new Notice(`Link removed from "${removedRange.text}"`);
    }

    private handleKeyDown(e: KeyboardEvent, editor: HTMLElement) {
        // Let all keystrokes pass through normally - we'll handle link separation in the input event
    }

    private handleLinkInsertion(editor: HTMLElement) {
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0) {
            new Notice('Please select text to turn into a link');
            return;
        }

        const range = selection.getRangeAt(0);
        const selectedText = range.toString().trim();

        if (!selectedText) {
            new Notice('Please select text to turn into a link');
            return;
        }

        new LinkModal(this.app, async (url) => {
            if (!url) return;

            // Create a link element
            const linkElement = document.createElement('span');
            linkElement.className = 'bluesky-link';
            linkElement.textContent = selectedText;
            linkElement.setAttribute('data-url', url);
            linkElement.setAttribute('title', url);
            linkElement.setAttribute('data-original-text', selectedText);
            
            // Replace the selected text with the link element
            range.deleteContents();
            range.insertNode(linkElement);
            
            // Clear selection
            selection.removeAllRanges();
            
            // Update the stored post content
            const index = parseInt(editor.getAttribute('data-index') || '0');
            this.posts[index] = this.getEditorText(editor);
            
            // Store link information for posting
            if (!this.linkRanges) {
                this.linkRanges = [];
            }
            
            this.linkRanges.push({
                start: 0, // We'll calculate this properly when posting
                end: 0,
                url: url,
                text: selectedText
            });
            
            this.updateButtonStates();
            
            // Show a visual indicator that the link has been added
            new Notice(`Link added to "${selectedText}"`);
            
            // Try to show link preview for the manually added link
            try {
                const index = parseInt(editor.getAttribute('data-index') || '0');
                // Only show preview if we don't already have one for this post
                if (!this.linkMetadata.get(index)) {
                    await this.detectAndPreviewLink(url, false, index);
                }
            } catch (error) {
                console.warn('Could not fetch link preview:', error);
                // Link is still added, just without preview
            }
        }).open();
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

        const editor = postContainer.createDiv({
            cls: 'bluesky-editor',
            attr: {
                contenteditable: 'true',
                'data-placeholder': 'Continue thread...',
                'data-index': index.toString()
            }
        });
        
        editor.textContent = '';
        editor.addEventListener('input', (e) => this.handleEditorChange(index, e));
        editor.addEventListener('keydown', (e) => this.handleKeyDown(e, editor));
        editor.addEventListener('paste', (e) => this.handlePaste(e));

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
                // Extract links from the editor for the first post
                const editor = this.containerEl.querySelector('.bluesky-editor') as HTMLElement;
                const editorLinks = editor ? this.extractLinksFromEditor(editor) : [];
                const metadata = this.linkMetadata.get(0); // Get metadata for first post
                success = await this.bot.createPost(validPosts[0], metadata, editorLinks);
            } else {
                success = await this.bot.createThread(validPosts);
            }
            this.posts = [''];
            this.linkMetadata.clear();
            this.linkPreviewEls.clear();
            this.linkRanges = [];
        } catch (error) {
            console.error('Failed to post:', error);
            if (error.message.includes('Failed to fetch')) {
                new Notice('Failed to post. Could not connect to the internet.')
            } else if (error.message.includes('Invalid identifier or password')) {
                new Notice('Invalid bluesky handle or password. Please check your bluesky plugin settings.')
            } else {
                new Notice(`Failed to post: ${error.message}`);
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
        
        // Clear all link data when redisplaying
        this.linkRanges = [];
        this.linkMetadata.clear();
        this.linkPreviewEls.clear();

        container.createEl("h4", { text: "Bluesky" });

        this.posts.forEach((post, index) => {
            const postContainer = container.createDiv({ cls: 'bluesky-compose' });

            const editor = postContainer.createDiv({
                cls: 'bluesky-editor',
                attr: {
                    contenteditable: 'true',
                    'data-placeholder': index === 0 ? "What's on your mind?" : "Continue thread...",
                    'data-index': index.toString()
                }
            });
            
            editor.textContent = post;
            editor.addEventListener('input', (e) => this.handleEditorChange(index, e));
            editor.addEventListener('keydown', (e) => this.handleKeyDown(e, editor));
            editor.addEventListener('paste', (e) => this.handlePaste(e));

            postContainer.createDiv({
                cls: 'bluesky-char-counter',
                text: `${post.length}/${this.MAX_CHARS}`
            });
        });

        const buttonContainer = container.createDiv({ cls: "bluesky-buttons" });

        const leftButtons = buttonContainer.createDiv({ cls: "bluesky-left-buttons" });
        
        const linkBtn = leftButtons.createEl("button", {
            text: "🔗 Link",
            cls: 'bluesky-link-btn',
            attr: {
                'aria-label': 'Select text and click to add link',
                'title': 'Select text and click to add link'
            }
        });

        linkBtn.addEventListener('click', () => {
            const editor = this.containerEl.querySelector('.bluesky-editor') as HTMLElement;
            if (editor) {
                this.handleLinkInsertion(editor);
            }
        });
        
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