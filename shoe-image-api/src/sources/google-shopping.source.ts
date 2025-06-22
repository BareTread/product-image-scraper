import { Page } from '@browserbasehq/stagehand';
import { Mutex } from 'async-mutex';
import { BrowserFactory } from './browser.factory';
import { config } from '../config';

const humanPause = async () => {
  const hd: any = (config.stagehand.localBrowserLaunchOptions as any).humanDelay;
  if (!hd) return;
  const { minMs = 100, maxMs = 300 } = hd;
  const ms = minMs + Math.random() * (maxMs - minMs);
  await new Promise(r => setTimeout(r, ms));
};
import { ImageSource } from '../types';
import { logger } from '../utils/logger';

const timeout = 20000;

export class GoogleShoppingSource implements ImageSource {
  priority = 1;
  name = 'google-shopping';
  private browserFactory: BrowserFactory;
  private mutex: Mutex;

  constructor() {
    this.browserFactory = BrowserFactory.getInstance();
    this.mutex = new Mutex();
  }

  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    const release = await this.mutex.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  async searchImage(query: string): Promise<string[]> {
    return this.withLock(async () => {
            const page = await this.browserFactory.getBrowserPage();
      try {
        const shoppingUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
        logger.debug(`Navigating to Google Shopping: ${shoppingUrl}`);
        await page.goto(shoppingUrl);
await humanPause();

        logger.debug('Waiting for shopping results to load...');
        // This selector targets the container for an individual shopping result.
        await page.waitForSelector('.sh-dgr__content', { timeout });
await humanPause();

        logger.debug('Extracting image URLs from shopping results...');
        const imageUrls = await page.evaluate(() => {
          const imageElements = Array.from(document.querySelectorAll('.sh-dgr__content img'));
          // Filter out small or invalid image URLs (e.g., base64 encoded)
          return imageElements
            .map(el => (el as HTMLImageElement).src)
            .filter(src => src && src.startsWith('https'));
        });

        logger.debug(`Extracted ${imageUrls.length} image URLs from Google Shopping.`);
        return imageUrls;
      } catch (error) {
        logger.error('An error occurred during Google Shopping search:', error);
        try {
          logger.info('Dumping page content on error...');
          const pageContent = await page.content();
          logger.info('Page content on error (first 5000 chars):', pageContent.substring(0, 5000));
        } catch (contentError) {
          logger.error('Failed to get page content on error:', contentError);
        }
        return [];
      }
    });
  }
}
