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

  private async retryPageOperation<T>(
    operationDescription: string,
    fn: () => Promise<T>,
    maxRetries: number = config.scraperService.search.pageOperationRetries,
    initialDelay: number = config.scraperService.search.pageOperationInitialDelayMs
  ): Promise<T> {
    let currentDelay = initialDelay;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${maxRetries} for page operation: ${operationDescription}`);
        return await fn();
      } catch (error: any) {
        logger.warn(`Page operation "${operationDescription}" attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        if (attempt === maxRetries) {
          logger.error(`All ${maxRetries} attempts for page operation "${operationDescription}" failed.`);
          throw error; // Re-throw the last error to be caught by the main searchImage catch block
        }
        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= 2; // Exponential backoff
      }
    }
    // Should be unreachable if maxRetries >= 1, as fn() will be called or error thrown.
    // Adding a fallback throw for type safety and unexpected scenarios.
    throw new Error(`Retry loop for "${operationDescription}" completed without success or error.`);
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
        const searchConfig = config.scraperService.search;
        const searchQuery = `${query}${searchConfig.querySuffix}`;

        await this.retryPageOperation(
          `Navigate to ${searchConfig.bingImageSearchUrl}`,
          () => page.goto(searchConfig.bingImageSearchUrl, { timeout: searchConfig.timeoutMs })
        );

        await this.retryPageOperation(
          `Type search query: "${searchQuery}"`,
          () => page.act(`type "${searchQuery}" in the search bar`)
          // Note: page.act does not have its own timeout, it relies on Stagehand's internal timeouts/logic.
          // If specific timeout needed for act, Stagehand API or custom promise timeout would be required.
        );

        await this.retryPageOperation(
          `Press Enter after typing query`,
          () => page.act('press Enter')
        );

        await this.retryPageOperation(
          `Wait for image results selector: ${searchConfig.imageResultsSelector}`,
          () => page.waitForSelector(searchConfig.imageResultsSelector, { timeout: searchConfig.timeoutMs })
        );

        logger.debug('Extracting image URLs from search results...');
        // page.evaluate is less likely to need retries unless the page structure is unexpectedly missing.
        // If it fails, it's usually a selector issue within the evaluate, caught by the main try/catch.
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
    } catch (error: any) {
      // Log the specific error that led to the reset, including the query
      logger.error(
        `Critical error during Bing image search for query "${query}", triggering Stagehand reset. Error: ${error.message}`,
        { error, query } // Pass error object and query for structured logging if supported
      );
      // Attempt recovery: reset browser so next call re-inits
      logger.info(`Attempting to reset Stagehand for query "${query}" due to critical error...`);
      await this.resetStagehand();
      logger.info(`Stagehand reset completed for query "${query}".`);
      return [];
    }

    });
  }
}
