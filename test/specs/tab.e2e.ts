import { browser, expect } from "@wdio/globals";
import "wdio-obsidian-service";
import { PLUGIN_ID, VIEW_TYPE_TAB } from "./helpers.js";

const LEAF_SELECTOR = `.workspace-leaf-content[data-type="${VIEW_TYPE_TAB}"]`;

/**
 * Set the compose editor's text and fire the input event the plugin listens
 * for. Keep test text URL-free: handleEditorChange runs detectAndPreviewLink,
 * and any URL in the text triggers a real metadata fetch (network).
 */
async function typeIntoEditor(text: string): Promise<void> {
	await browser.executeObsidian((_args, leafSelector, value) => {
		const editor = document.querySelector(`${leafSelector} .bluesky-editor`) as HTMLElement;
		editor.textContent = value;
		editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
	}, LEAF_SELECTOR, text);
}

describe("Bluesky tab view", function () {
	beforeEach(async function () {
		await browser.executeObsidian(({ app }, viewType) => {
			app.workspace.detachLeavesOfType(viewType);
		}, VIEW_TYPE_TAB);
		await browser.executeObsidianCommand(`${PLUGIN_ID}:open-bluesky-tab`);
		await expect(browser.$(LEAF_SELECTOR)).toExist();
	});

	it("renders the compose UI", async function () {
		const leaf = browser.$(LEAF_SELECTOR);
		await expect(leaf.$("h4=Bluesky")).toExist();

		const editor = leaf.$(".bluesky-editor");
		await expect(editor).toExist();
		expect(await editor.getAttribute("contenteditable")).toBe("true");
		expect(await editor.getAttribute("data-placeholder")).toBe("What's on your mind?");

		await expect(leaf.$(".bluesky-char-counter")).toHaveText("0/300");
		await expect(leaf.$(".bluesky-link-btn")).toExist();
		await expect(leaf.$(".add-bluesky-thread-btn")).toExist();
		await expect(leaf.$(".bluesky-post-btn")).toExist();
	});

	it("starts with Post and Add-to-thread disabled until text is entered", async function () {
		const leaf = browser.$(LEAF_SELECTOR);
		await expect(leaf.$(".bluesky-post-btn")).not.toBeEnabled();
		await expect(leaf.$(".add-bluesky-thread-btn")).not.toBeEnabled();

		await typeIntoEditor("Hello world");

		await expect(leaf.$(".bluesky-char-counter")).toHaveText("11/300");
		await expect(leaf.$(".bluesky-post-btn")).toBeEnabled();
		await expect(leaf.$(".add-bluesky-thread-btn")).toBeEnabled();
	});

	it("flags the counter and disables Post past 300 characters", async function () {
		const leaf = browser.$(LEAF_SELECTOR);
		await typeIntoEditor("x".repeat(301));

		const counter = leaf.$(".bluesky-char-counter");
		await expect(counter).toHaveText("301/300");
		await expect(counter).toHaveElementClass("exceeded");
		await expect(leaf.$(".bluesky-post-btn")).not.toBeEnabled();
	});

	it("adds and removes a thread post", async function () {
		const leaf = browser.$(LEAF_SELECTOR);
		await typeIntoEditor("First post in a thread");

		await leaf.$(".add-bluesky-thread-btn").click();
		await expect(leaf.$$(".bluesky-compose")).toBeElementsArrayOfSize(2);

		const editors = Array.from(await leaf.$$(".bluesky-editor").getElements());
		expect(await editors[1].getAttribute("data-placeholder")).toBe("Continue thread...");

		await leaf.$(".bluesky-close-post").click();
		await expect(leaf.$$(".bluesky-compose")).toBeElementsArrayOfSize(1);
	});

	it("opens the insert-link modal for selected text and closes on Escape", async function () {
		// Select the editor text and click 🔗 Link in one script so the
		// selection survives until handleLinkInsertion reads it. Escape only —
		// submitting the modal would fetch link metadata over the network.
		await typeIntoEditor("turn me into a link");
		await browser.executeObsidian((_args, leafSelector) => {
			const editor = document.querySelector(`${leafSelector} .bluesky-editor`) as HTMLElement;
			const range = document.createRange();
			range.selectNodeContents(editor);
			const selection = window.getSelection()!;
			selection.removeAllRanges();
			selection.addRange(range);
			(document.querySelector(`${leafSelector} .bluesky-link-btn`) as HTMLElement).click();
		}, LEAF_SELECTOR);

		const modal = browser.$(".modal-container .modal");
		await expect(modal).toBeDisplayed();
		await expect(modal.$("h2=Insert link")).toExist();
		await expect(modal.$('input[placeholder="https://example.com"]')).toExist();

		await browser.keys("Escape");
		await expect(browser.$(".modal-container")).not.toExist();
	});
});
