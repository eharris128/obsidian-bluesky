import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import { BlueskyBot, type LinkMetadata } from '@/bluesky';
import { parseBskyPostUrl, type ReplyTarget } from '@/utils/reply';
import type BlueskyPlugin from '@/main';
import { BLUESKY_TITLE, VIEW_TYPE_TAB } from '@/consts';
import { LinkModal } from '@/modals/LinkModal';
import { logger } from '@/utils/logger';
import { parseMarkdownLinks, findFirstMarkdownLink } from '@/utils/markdown';

export class BlueskyTab extends ItemView {
    private readonly plugin: BlueskyPlugin;
    private bot: BlueskyBot;
    private posts: string[] = [''];
    private isPosting: boolean;
    private readonly MAX_CHARS = 300;
    private linkMetadata: Map<number, LinkMetadata> = new Map(); // Track metadata per post index
    private linkPreviewEls: Map<number, HTMLElement> = new Map(); // Track preview elements per post
    private linkRanges: Array<{start: number, end: number, url: string, text: string}> = [];
    private replyTarget: ReplyTarget | null = null; // resolved post to reply to
    private replyUrlPending = false; // reply field non-empty but unresolved/invalid
    private replyRequestSeq = 0; // guards against out-of-order reply lookups

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

        // Convert completed markdown links ([text](url)) into styled links
        this.convertMarkdownLinks(editor);

        // First, fix any links that have been extended by typing
        this.fixExtendedLinks(editor);

        // Auto-detect and style pasted URLs
        this.autoStyleUrls(editor);
        
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
        void this.detectAndPreviewLink(text, true, index);

        this.updateButtonStates();
    }

    private autoStyleUrls(editor: HTMLElement) {
        const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

        let styledAny = false;
        let madeChange = true;

        // Wrap the first not-yet-styled URL, then re-walk. Rebuilding the walk
        // after every change keeps text offsets valid as the DOM is mutated and
        // avoids writing raw HTML to the editor.
        while (madeChange) {
            madeChange = false;

            const walker = activeDocument.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
                // Skip text that already lives inside a styled link
                if (node.parentElement?.closest('.bluesky-link')) continue;

                const nodeText = node.textContent || '';
                const match = nodeText.match(urlRegex);
                if (!match || match.index === undefined) continue;

                const url = match[0];
                const range = activeDocument.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + url.length);

                const linkEl = createSpan({
                    cls: 'bluesky-link',
                    text: url,
                    attr: { 'data-url': url, 'data-original-text': url, title: url }
                });

                range.deleteContents();
                range.insertNode(linkEl);

                styledAny = true;
                madeChange = true;
                break; // DOM changed; restart the walk
            }
        }

        if (styledAny) {
            // Place cursor at the end of the content
            const selection = activeWindow.getSelection();
            if (selection) {
                const range = activeDocument.createRange();
                range.selectNodeContents(editor);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }
    }


    // Replace completed markdown link syntax ([text](url)) in the editor with
    // styled link elements, so the editor shows what will actually be posted
    private convertMarkdownLinks(editor: HTMLElement) {
        let match = findFirstMarkdownLink(editor.textContent || '');

        while (match) {
            // The markdown syntax may span several DOM nodes (e.g. a partially
            // auto-styled URL), so locate it by text offset and replace the range
            const range = this.createRangeFromTextOffsets(editor, match.start, match.end);
            if (!range) return;

            const linkElement = createSpan({
                cls: 'bluesky-link',
                text: match.text,
                attr: { 'data-url': match.url, title: match.url, 'data-original-text': match.text }
            });

            range.deleteContents();
            range.insertNode(linkElement);

            // Place the cursor right after the new link
            const selection = activeWindow.getSelection();
            if (selection) {
                const cursor = activeDocument.createRange();
                cursor.setStartAfter(linkElement);
                cursor.collapse(true);
                selection.removeAllRanges();
                selection.addRange(cursor);
            }

            match = findFirstMarkdownLink(editor.textContent || '');
        }
    }

    // Build a DOM range covering the given character offsets of the editor's text
    private createRangeFromTextOffsets(root: HTMLElement, start: number, end: number): Range | null {
        const walker = activeDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let pos = 0;
        let startNode: Node | null = null;
        let startOffset = 0;
        let endNode: Node | null = null;
        let endOffset = 0;

        let node: Node | null;
        while ((node = walker.nextNode())) {
            const length = node.textContent?.length || 0;
            if (!startNode && pos + length >= start) {
                startNode = node;
                startOffset = start - pos;
            }
            if (startNode && pos + length >= end) {
                endNode = node;
                endOffset = end - pos;
                break;
            }
            pos += length;
        }

        if (!startNode || !endNode) return null;

        const range = activeDocument.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
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
                const textNode = activeDocument.createTextNode(extraText);
                if (linkElement.nextSibling) {
                    linkElement.parentNode?.insertBefore(textNode, linkElement.nextSibling);
                } else {
                    linkElement.parentNode?.appendChild(textNode);
                }

                // Move cursor to the end of the new text
                const selection = activeWindow.getSelection();
                if (selection) {
                    const range = activeDocument.createRange();
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
        if (!text) return;

        const editor = event.currentTarget as HTMLElement;
        const selection = activeWindow.getSelection();
        if (!selection || selection.rangeCount === 0) return;

        // Insert the plain text at the caret, replacing any current selection
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = activeDocument.createTextNode(text);
        range.insertNode(textNode);

        // Move the caret to just after the inserted text
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);

        // Default paste was prevented, so run the normal input handling manually
        editor.dispatchEvent(new Event('input', { bubbles: true }));
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
        
        // Check for URLs in markdown links, plain text, and manual links
        const markdownLinks = parseMarkdownLinks(text).links;
        let url = markdownLinks.length > 0
            ? markdownLinks[0].url
            : (typeof text === 'string' && text.startsWith('http') ? text : this.bot.extractFirstUrl(text));
        
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
                logger.warn('Error fetching link preview:', error);
                if (existingPreviewEl && !hasManualLinks) {
                    existingPreviewEl.remove();
                    this.linkPreviewEls.delete(postIndex);
                    this.linkMetadata.delete(postIndex);
                }
            }
        }
    }

    private showLinkPreview(metadata: LinkMetadata, postIndex = 0) {
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
        const selection = activeWindow.getSelection();
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

        new LinkModal(this.app, (url) => {
            if (!url) return;

            // Create a link element
            const linkElement = createSpan({
                cls: 'bluesky-link',
                text: selectedText,
                attr: { 'data-url': url, title: url, 'data-original-text': selectedText }
            });

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

            // Try to show link preview for the manually added link. The link is
            // already added, so a failed preview is non-fatal.
            if (!this.linkMetadata.get(index)) {
                void this.detectAndPreviewLink(url, false, index).catch((error) => {
                    logger.warn('Could not fetch link preview:', error);
                });
            }
        }).open();
    }

    private clearReplyStatus(container: HTMLElement) {
        container.querySelector('.bluesky-reply-preview')?.remove();
        container.querySelector('.bluesky-reply-error')?.remove();
        container.querySelector('.bluesky-reply-loading')?.remove();
    }

    private async handleReplyUrlChange(rawUrl: string) {
        const url = rawUrl.trim();
        const replyContainer = this.containerEl.querySelector<HTMLElement>('.bluesky-reply');
        if (!replyContainer) return;

        // Bump the sequence so any in-flight lookup from an earlier change
        // becomes stale and discards its result instead of overwriting this one.
        const seq = ++this.replyRequestSeq;

        this.clearReplyStatus(replyContainer);

        if (!url) {
            this.replyTarget = null;
            this.replyUrlPending = false;
            this.updateButtonStates();
            return;
        }

        // Cheap offline check first — only hit the network for a real post URL
        if (!parseBskyPostUrl(url)) {
            this.replyTarget = null;
            this.replyUrlPending = true;
            this.showReplyError(replyContainer, 'Not a Bluesky post URL.');
            this.updateButtonStates();
            return;
        }

        this.replyTarget = null;
        this.replyUrlPending = true;
        this.updateButtonStates();
        const loadingEl = replyContainer.createDiv({ cls: 'bluesky-reply-loading', text: 'Looking up post…' });

        let target: ReplyTarget | null = null;
        try {
            target = await this.bot.resolveReplyTarget(url);
        } catch (error) {
            logger.warn('Failed to resolve reply target:', error);
        }

        // A newer change superseded this lookup — discard its result. The newer
        // call's clearReplyStatus already removed this call's loading row.
        if (seq !== this.replyRequestSeq) return;

        loadingEl.remove();
        if (!target) {
            this.replyTarget = null;
            this.replyUrlPending = true;
            this.showReplyError(replyContainer, "Couldn't find that post.");
            this.updateButtonStates();
            return;
        }
        this.replyTarget = target;
        this.replyUrlPending = false;
        this.showReplyPreview(replyContainer, target);
        this.updateButtonStates();
    }

    private showReplyError(container: HTMLElement, message: string) {
        this.clearReplyStatus(container);
        container.createDiv({ cls: 'bluesky-reply-error', text: message });
    }

    private showReplyPreview(container: HTMLElement, target: ReplyTarget) {
        this.clearReplyStatus(container);

        const preview = container.createDiv({ cls: 'bluesky-reply-preview' });
        preview.createDiv({ cls: 'bluesky-reply-preview-label', text: 'Replying to' });

        const author = target.preview.authorName
            ? `${target.preview.authorName} (@${target.preview.authorHandle})`
            : `@${target.preview.authorHandle}`;
        preview.createDiv({ cls: 'bluesky-reply-preview-author', text: author });

        const snippet = target.preview.text.length > 200
            ? target.preview.text.slice(0, 200) + '…'
            : target.preview.text;
        if (snippet) {
            preview.createDiv({ cls: 'bluesky-reply-preview-text', text: snippet });
        }

        const removeBtn = preview.createEl('button', {
            cls: 'bluesky-reply-preview-remove',
            attr: { 'aria-label': 'Remove reply target' }
        });
        this.plugin.addIcon(removeBtn, 'lucide-x');
        removeBtn.addEventListener('click', () => {
            this.replyTarget = null;
            this.replyUrlPending = false;
            preview.remove();
            const input = this.containerEl.querySelector<HTMLInputElement>('.bluesky-reply-input');
            if (input) input.value = '';
            this.updateButtonStates();
        });
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
            postButton.disabled = !hasValidFirstPost || !hasAnyContent || isExceeded || this.replyUrlPending;
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
                spellcheck: 'false',
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
        if (this.replyUrlPending) return; // reply URL entered but not resolved

        // Pair each post with the links from its editor before filtering,
        // so post text and link ranges stay aligned
        const editors = Array.from(this.containerEl.querySelectorAll<HTMLElement>('.bluesky-editor'));
        const validPosts = this.posts
            .map((text, index) => ({
                text,
                links: editors[index] ? this.extractLinksFromEditor(editors[index]) : []
            }))
            .filter(post => post.text.trim());
        if (!validPosts.length) return;
        let success = false
        try {
            this.isPosting = true;
            await this.bot.login();
            const replyRefs = this.replyTarget?.refs;
            if (validPosts.length === 1) {
                const metadata = this.linkMetadata.get(0); // Get metadata for first post
                success = await this.bot.createPost(validPosts[0].text, metadata, validPosts[0].links, replyRefs);
            } else {
                success = await this.bot.createThread(
                    validPosts.map(post => post.text),
                    validPosts.map(post => post.links),
                    replyRefs
                );
            }
            this.posts = [''];
            this.linkMetadata.clear();
            this.linkPreviewEls.clear();
            this.linkRanges = [];
            this.replyTarget = null;
            this.replyUrlPending = false;
        } catch (error) {
            logger.error('Failed to post:', error);
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
        this.replyTarget = null;
        this.replyUrlPending = false;

        container.createEl("h4", { text: "Bluesky" });

        // Optional reply target: paste a bsky.app post URL to attach this post
        // (or thread) as a reply that continues that post's thread.
        const replyContainer = container.createDiv({ cls: 'bluesky-reply' });
        const replyInput = replyContainer.createEl('input', {
            cls: 'bluesky-reply-input',
            attr: {
                type: 'text',
                placeholder: 'Reply to a Bluesky post (paste its URL, optional)',
                'aria-label': 'Reply to a Bluesky post by pasting its URL'
            }
        });
        replyInput.addEventListener('change', () => { void this.handleReplyUrlChange(replyInput.value); });

        this.posts.forEach((post, index) => {
            const postContainer = container.createDiv({ cls: 'bluesky-compose' });

            const editor = postContainer.createDiv({
                cls: 'bluesky-editor',
                attr: {
                    contenteditable: 'true',
                    spellcheck: 'false',
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

        postButton.addEventListener('click', () => { void this.publishContent(); });

        this.updateButtonStates();
    }
}