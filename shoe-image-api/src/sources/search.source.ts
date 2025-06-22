import { Stagehand } from '@browserbasehq/stagehand';
import { ImageSource } from '../types';
import { logger } from '../utils/logger';
import { config } from '../config';

export class SearchEngineSource implements ImageSource {
  name = 'search-engine';
  priority = 1; // single source

  // --- Singleton Stagehand & simple mutex ---
  private static stagehand: Stagehand | null = null;
  private static initializing: Promise<void> | null = null;
  private static mutex: Promise<void> = Promise.resolve();

  private async resetStagehand() {
    if (SearchEngineSource.stagehand) {
      try {
        await SearchEngineSource.stagehand.close();
      } catch {}
    }
    SearchEngineSource.stagehand = null;
    SearchEngineSource.initializing = null;
  }

  private async getBrowserPage() {
    // Ensure single initialization at a time
    if (!SearchEngineSource.stagehand) {
      if (!SearchEngineSource.initializing) {
        SearchEngineSource.initializing = (async () => {
          const sh = new Stagehand(config.stagehand);
          await sh.init();
          SearchEngineSource.stagehand = sh;
        })();
      }
      // Wait for initialization to finish (or reuse if in progress)
      await SearchEngineSource.initializing;
    }
    return SearchEngineSource.stagehand!.page;
  }

  // Simple promise-based mutex to serialize Page usage
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const prev = SearchEngineSource.mutex;
    let release!: () => void;
    SearchEngineSource.mutex = new Promise<void>(res => (release = res));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async searchImage(query: string): Promise<string[]> {
    return this.withLock(async () => {
      try {
            const page = await this.getBrowserPage();
      const timeout = 20000; // 20 seconds

      logger.debug('Navigating to Bing Images...');
            await page.goto('https://www.bing.com/images/search', { timeout });

      logger.debug(`Searching for: ${query}`);
                  await page.act(`type "${query}" in the search bar`);
                  await page.act('press Enter');

      logger.debug('Waiting for image results to load...');
      // Wait for the image results container to ensure images are loaded.
    // We target 'a.iusc' as it's the specific element containing the image data.
    await page.waitForSelector('a.iusc', { timeout });

      logger.debug('Extracting image URLs from search results...');
      const imageUrls = await page.evaluate(() => {
        const imageElements = Array.from(document.querySelectorAll('a.iusc')) as HTMLAnchorElement[];
        const urls = imageElements.map(el => {
          const m = el.getAttribute('m');
          if (!m) return null;
          try {
            const data = JSON.parse(m);
            return data.murl as string; // murl is the full-resolution image URL
          } catch {
            return null;
          }
        }).filter((u): u is string => !!u && u.startsWith('http'));
        return urls;
      });

      logger.debug(`Extracted ${imageUrls.length} image URLs.`);
      return imageUrls;
    } catch (error) {
      logger.error('An error occurred during Bing image search:', error);
      // Attempt recovery: reset browser so next call re-inits
      await this.resetStagehand();
      return [];
    }

    });
  }
}
