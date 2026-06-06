import { browser, expect } from "@wdio/globals";
import { obsidianPage } from "wdio-obsidian-service";
import { PLUGIN_ID } from "./helpers.js";

const POST_COMMAND = `${PLUGIN_ID}:post-to-bluesky`;

/** Open a vault file and select one line of it, returning the selected text. */
async function openAndSelectLine(file: string, line: number): Promise<string> {
	await obsidianPage.openFile(file);
	return browser.executeObsidian(({ app }, lineNo) => {
		const editor = (app as any).workspace.activeEditor.editor;
		const text: string = editor.getLine(lineNo);
		editor.setSelection({ line: lineNo, ch: 0 }, { line: lineNo, ch: text.length });
		return text;
	}, line);
}

// The staged test data.json is empty, so confirmBeforePosting defaults to
// true and "Post highlighted text" opens ConfirmPostModal. The specs only
// ever close the modal (Escape/Cancel) — confirming would attempt a login,
// which fails fast on the empty credentials but is still out of scope here.
describe("post confirmation modal", function () {
	afterEach(async function () {
		// Don't leak an open modal (or a stale notice) into the next test.
		if (await browser.$(".modal-container").isExisting()) {
			await browser.keys("Escape");
		}
		await browser.executeObsidian(() => {
			document.querySelectorAll(".notice").forEach((el) => el.remove());
		});
	});

	it("shows a notice instead of the modal when nothing is selected", async function () {
		await obsidianPage.openFile("Welcome.md");
		await browser.executeObsidian(({ app }) => {
			(app as any).workspace.activeEditor.editor.setCursor({ line: 0, ch: 0 });
		});
		await browser.executeObsidianCommand(POST_COMMAND);

		await expect(browser.$(".notice*=Please select some text to post")).toExist();
		await expect(browser.$(".modal-container")).not.toExist();
	});

	it("previews the selection with a char counter and closes on Escape", async function () {
		const selected = await openAndSelectLine("Welcome.md", 0);
		await browser.executeObsidianCommand(POST_COMMAND);

		const modal = browser.$(".modal-container .modal");
		await expect(modal).toBeDisplayed();
		await expect(modal.$("h2=Post to Bluesky?")).toExist();
		await expect(modal.$(".bluesky-confirm-preview")).toHaveText(selected);
		await expect(modal.$(".bluesky-char-counter")).toHaveText(`${selected.length}/300`);
		await expect(modal.$("button=Post")).toExist();
		await expect(modal.$("button=Cancel")).toExist();

		await browser.keys("Escape");
		await expect(browser.$(".modal-container")).not.toExist();
	});

	it("renders markdown links as styled link text, and Cancel closes without posting", async function () {
		// Rich Text.md line 0: Read the [Anthropic blog](https://www.anthropic.com/news) for updates.
		await openAndSelectLine("Rich Text.md", 0);
		await browser.executeObsidianCommand(POST_COMMAND);

		const preview = browser.$(".modal-container .bluesky-confirm-preview");
		// The markdown syntax is replaced by the link's display text…
		await expect(preview).toHaveText("Read the Anthropic blog for updates.");
		// …and that text is highlighted as a link carrying the URL.
		const link = preview.$(".bluesky-link");
		await expect(link).toHaveText("Anthropic blog");
		expect(await link.getAttribute("title")).toBe("https://www.anthropic.com/news");

		await browser.$(".modal-container").$("button=Cancel").click();
		await expect(browser.$(".modal-container")).not.toExist();
		// Cancel must not trigger the post flow (no failure notice from login).
		await expect(browser.$(".notice")).not.toExist();
	});

	it("highlights bare URLs that Bluesky will auto-link", async function () {
		// Rich Text.md line 1: Docs live at https://example.com/docs today.
		await openAndSelectLine("Rich Text.md", 1);
		await browser.executeObsidianCommand(POST_COMMAND);

		const link = browser.$(".modal-container .bluesky-confirm-preview .bluesky-link");
		await expect(link).toHaveText("https://example.com/docs");

		await browser.keys("Escape");
	});

	it("leaves vault-internal markdown links untouched", async function () {
		// Rich Text.md line 2: See [the notes](Notes/Apollo.md) for vault-internal links…
		await openAndSelectLine("Rich Text.md", 2);
		await browser.executeObsidianCommand(POST_COMMAND);

		const preview = browser.$(".modal-container .bluesky-confirm-preview");
		// .md targets are vault notes, not web links — raw markdown is kept.
		expect(await preview.getText()).toContain("[the notes](Notes/Apollo.md)");
		await expect(preview.$(".bluesky-link=the notes")).not.toExist();

		await browser.keys("Escape");
	});

	it("marks the counter as exceeded for selections over 300 characters", async function () {
		await obsidianPage.openFile("Welcome.md");
		await browser.executeObsidian(({ app }) => {
			const editor = (app as any).workspace.activeEditor.editor;
			// URL-free filler: the modal preview itself is offline, but keep the
			// suite's no-network rule anyway.
			editor.setValue("long ".repeat(70));
			editor.setSelection({ line: 0, ch: 0 }, { line: 0, ch: editor.getLine(0).length });
		});
		await browser.executeObsidianCommand(POST_COMMAND);

		const counter = browser.$(".modal-container .bluesky-char-counter");
		await expect(counter).toHaveElementClass("exceeded");

		await browser.keys("Escape");
	});
});
