import { App, Modal, Setting } from "obsidian";

export class LinkModal extends Modal {
    result: string;
    onSubmit: (result: string) => void;

    constructor(app: App, onSubmit: (result: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl("h2", { text: "Insert link" });

        new Setting(contentEl)
            .setName("URL")
            .addText((text) =>
                text
                    .setPlaceholder("https://example.com")
                    .setValue(this.result)
                    .onChange((value) => {
                        this.result = value;
                    })
                    .inputEl.addEventListener("keypress", (e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            this.close();
                            this.onSubmit(this.result);
                        }
                    })
            );

        new Setting(contentEl)
            .addButton((btn) =>
                btn
                    .setButtonText("Insert")
                    .setCta()
                    .onClick(() => {
                        this.close();
                        this.onSubmit(this.result);
                    })
            )
            .addButton((btn) =>
                btn
                    .setButtonText("Cancel")
                    .onClick(() => {
                        this.close();
                    })
            );

        setTimeout(() => {
            const inputEl = contentEl.querySelector("input");
            inputEl?.focus();
        }, 50);
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}