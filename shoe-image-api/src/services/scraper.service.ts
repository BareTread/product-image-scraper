import axios from 'axios';
import { ImageSource, ScrapingResult } from '../types';
import { CacheService } from './cache.service';

import { GeminiValidatorService } from './gemini-validator.service';
import { ImageProcessorService } from './image-processor.service';
import { SearchEngineSource } from '../sources/search.source';
import { GoogleShoppingSource } from '../sources/google-shopping.source';
import { logger } from '../utils/logger';

export class ScraperService {
  private sources: ImageSource[];
  private cache: CacheService;

    private geminiValidator: GeminiValidatorService;
  private imageProcessor: ImageProcessorService;

  constructor() {
    this.sources = [
      new GoogleShoppingSource(),
      new SearchEngineSource(),
    ];
    this.cache = new CacheService();

        this.geminiValidator = new GeminiValidatorService();
    this.imageProcessor = new ImageProcessorService();
  }

  async getShoeImage(model: string): Promise<ScrapingResult> {
    logger.info(`Processing request for: ${model}`);

    const cachedPath = this.cache.getCachedImage(model);
    if (cachedPath) {
      logger.info(`Cache hit for "${model}". Returning cached image.`);
      return { success: true, localPath: cachedPath, source: 'cache' };
    }

    logger.info(`No cache entry for "${model}". Starting scrape across ${this.sources.length} source(s)...`);
    for (const source of this.sources) {
      try {
        const urls = await source.searchImage(model);
        logger.info(`Source "${source.name}" found ${urls.length} potential URLs.`);

        for (const url of urls) {
          const result = await this.downloadAndValidate(url, model, source.name);
          if (result.success) {
            return result;
          }
        }
      } catch (error) {
        logger.error(`Source ${source.name} threw an error:`, error);
      }
    }

    return { success: false, error: 'No valid product image found from any source.' };
  }

  private async downloadAndValidate(url: string, model: string, sourceName: string): Promise<ScrapingResult> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const imageBuffer = Buffer.from(response.data);

      // Unified validation: this now checks for white background AND runs Gemini validation.
      const geminiResult = await this.geminiValidator.validateImage(
        imageBuffer,
        model
      );

      logger.debug(`Gemini validation result for ${url}:`, geminiResult);

      if (!geminiResult) {
        logger.debug(`Image from ${url} failed validation (background or Gemini).`);
        return { success: false, error: 'Image failed validation' };
      }

      // Process the image to make it unique for SEO
      const processedBuffer = await this.imageProcessor.makeUnique(
        imageBuffer,
        geminiResult
      );

      const localPath = this.cache.saveImage(geminiResult, processedBuffer);
      logger.info(
        `SUCCESS: Valid image for "${geminiResult.model}" found via ${sourceName} and cached.`
      );
      return { success: true, imageUrl: url, localPath, source: sourceName };
    } catch (error: any) {
      logger.debug(`Failed to download or process ${url}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
