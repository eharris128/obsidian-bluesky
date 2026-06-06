import { App, Modal, Setting } from "obsidian";

export class ConfirmPostModal extends Modal {
    private readonly text: string;
    private readonly onConfirm: () => void;
    private static readonly MAX_CHARS = 300;

    constructor(app: App, text: string, onConfirm: () => void) {
        super(app);
        this.text = text;
        this.onConfirm = onConfirm;
    }

    onOpen() {
        const { contentEl } = this;

        contentEl.createEl("h2", { text: "Post to Bluesky?" });

        contentEl.createDiv({
            cls: 'bluesky-confirm-preview',
            text: this.text
        });

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
