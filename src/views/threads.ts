import { ItemView, WorkspaceLeaf } from 'obsidian';
import { BlueskyBot } from '@/bluesky';
import type BlueskyPlugin from '@/main'


export class ThreadsView extends ItemView {
    private bot: BlueskyBot;

  private posts: string[] = [''];
  private isPosting: boolean = false;
  private readonly MAX_CHARS = 300;

  constructor(leaf: WorkspaceLeaf, plugin: BlueskyPlugin) {
    super(leaf);
    this.bot = new BlueskyBot(plugin);
  }

  getViewType(): string {
    return 'threads-view';
  }

  getDisplayText(): string {
    return 'Threads';
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
      counter.textContent = `${limitedText.length}/${this.MAX_CHARS} characters`;
    }
  }

  private addPost() {
    this.posts.push('');
    this.updateView();
  }

  private removePost(index: number) {
    if (this.posts.length === 1) return;
    this.posts = this.posts.filter((_, i) => i !== index);
    this.updateView();
  }

  private async publishThread() {
    if (this.isPosting) return;
    
    const validPosts = this.posts.filter(post => post.trim());
    if (!validPosts.length) return;
    
    try {
        this.isPosting = true;
        this.updateView();
        
        await this.bot.login();
        await this.bot.createThread(validPosts);
        
        this.posts = [''];
    } catch (error) {
        console.error('Error publishing thread:', error);
    } finally {
        this.isPosting = false;
        this.updateView();
    }
  }

  private updateView() {
    const contentEl = this.containerEl.children[1];
    contentEl.empty();
    this.display();
  }

  async onOpen() {
    this.display();
  }

  private display() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('threads-container');
    
    container.createEl('h2', { text: 'Create Thread' });

    this.posts.forEach((post, index) => {
      const postContainer = container.createEl('div', { cls: 'post-container' });
      
      const textarea = postContainer.createEl('textarea', {
        cls: 'text-field',
        attr: {
          placeholder: `Post ${index + 1}`,
          rows: '4',
          maxlength: this.MAX_CHARS.toString()
        },
        value: post
      });
      textarea.addEventListener('input', (e) => this.handlePostChange(index, e));

      postContainer.createEl('div', {
        cls: 'char-counter',
        text: `${post.length}/${this.MAX_CHARS} characters`
      });

      const removeButton = postContainer.createEl('button', {
        cls: 'button-secondary',
        text: 'Remove Post'
      });
      removeButton.disabled = this.posts.length === 1;
      removeButton.addEventListener('click', () => this.removePost(index));
    });

    const buttonGroup = container.createEl('div', { cls: 'button-group' });

    const addButton = buttonGroup.createEl('button', {
      cls: 'button-primary',
      text: 'Add Post'
    });
    addButton.addEventListener('click', () => this.addPost());

    const publishButton = buttonGroup.createEl('button', {
      cls: 'button-primary',
      text: this.isPosting ? 'Publishing...' : 'Publish Thread'
    });
    publishButton.disabled = this.isPosting || !this.posts.some(post => post.trim());
    publishButton.addEventListener('click', () => this.publishThread());
  }
}
