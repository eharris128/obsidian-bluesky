import { App, Modal, Setting } from "obsidian";
import { parseMarkdownLinks, detectBareLinks, type ParsedMarkdown } from "@/utils/markdown";

export class ConfirmPostModal extends Modal {
    private readonly parsed: ParsedMarkdown;
    private readonly onConfirm: () => void;
    private static readonly MAX_CHARS = 300;

    constructor(app: App, text: string, onConfirm: () => void) {
        super(app);
        // Preview the text as it will be posted, with markdown link syntax
        // replaced by the link's display text
        this.parsed = parseMarkdownLinks(text);
        this.onConfirm = onConfirm;
    }

    get text(): string {
        return this.parsed.text;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Post to Bluesky?" });

        const preview = contentEl.createDiv({ cls: 'bluesky-confirm-preview' });

        // Highlight markdown links plus bare URLs that will be auto-linked,
        // skipping any detected ranges that overlap a markdown link
        const markdownLinks = this.parsed.links;
        const links = [
            ...markdownLinks,
            ...detectBareLinks(this.text).filter(bare =>
                !markdownLinks.some(md => bare.start < md.end && md.start < bare.end))
        ].sort((a, b) => a.start - b.start);

        // Render the text with link ranges styled like links
        let cursor = 0;
        for (const link of links) {
            preview.appendText(this.text.slice(cursor, link.start));
            preview.createSpan({
                cls: 'bluesky-link',
                text: link.text,
                attr: { title: link.url }
            });
            cursor = link.end;
        }
        preview.appendText(this.text.slice(cursor));

        const counter = contentEl.createDiv({
            cls: 'bluesky-char-counter',
            text: `${this.text.length}/${ConfirmPostModal.MAX_CHARS}`
        });
        if (this.text.length > ConfirmPostModal.MAX_CHARS) {
            counter.classList.add('exceeded');
        }

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Post")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onConfirm();
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.close();
                    })
            );
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
