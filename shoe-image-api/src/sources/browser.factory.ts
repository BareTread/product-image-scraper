import { Stagehand, Page } from '@browserbasehq/stagehand';
import { config } from '../config';

let instance: BrowserFactory | null = null;

export class BrowserFactory {
  private stagehand: Stagehand;


  private constructor() {
    // Pass full configuration (including stealth flags) to Stagehand
    this.stagehand = new Stagehand(config.stagehand);
  }

  public static getInstance(): BrowserFactory {
    if (!instance) {
      instance = new BrowserFactory();
    }
    return instance;
  }

  public async init(): Promise<void> {
    await this.stagehand.init();
  }

  public async close(): Promise<void> {
    await this.stagehand.close();
  }

  private initialized = false;

  public async getBrowserPage(): Promise<Page> {
    if (!this.initialized) {
      await this.stagehand.init();
      this.initialized = true;
    }
    return this.stagehand.page;
  }
}
