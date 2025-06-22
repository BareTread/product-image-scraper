import { Stagehand, Page } from '@browserbasehq/stagehand';

let instance: BrowserFactory | null = null;

export class BrowserFactory {
  private stagehand: Stagehand;


  private constructor() {
            this.stagehand = new Stagehand({ env: 'LOCAL', verbose: 2 });
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

  public getBrowserPage(): Page {
    return this.stagehand.page;
  }
}
