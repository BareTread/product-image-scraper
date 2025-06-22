import axios from 'axios';
import { ImageSource, ScrapingResult } from '../types';
import { CacheService } from './cache.service';
import { ValidatorService } from './validator.service';
import { SearchEngineSource } from '../sources/search.source';
import { logger } from '../utils/logger';

export class ScraperService {
  private source: ImageSource;
  private cache: CacheService;
  private validator: ValidatorService;

  constructor() {
    this.source = new SearchEngineSource();
    this.cache = new CacheService();
    this.validator = new ValidatorService();
  }

  async getShoeImage(model: string): Promise<ScrapingResult> {
    logger.info(`Processing request for: ${model}`);

    const cachedPath = this.cache.getCachedImage(model);
    if (cachedPath) {
      logger.info(`Cache hit for "${model}". Returning cached image.`);
      return { success: true, localPath: cachedPath, source: 'cache' };
    }

    logger.info(`No cache entry for "${model}". Starting scrape using ${this.source.name}...`);
    try {
      const urls = await this.source.searchImage(model);
      logger.info(`Source "${this.source.name}" found ${urls.length} potential URLs.`);

      for (const url of urls) {
        const result = await this.downloadAndValidate(url, model, this.source.name);
        if (result.success) {
          return result;
        }
      }
    } catch (error) {
      logger.error(`Source ${this.source.name} threw an error:`, error);
    }

    return { success: false, error: 'No valid product image found from any source.' };
  }

  private async downloadAndValidate(url: string, model: string, sourceName: string): Promise<ScrapingResult> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const imageBuffer = Buffer.from(response.data);

      const isValid = await this.validator.validateImage(imageBuffer);

      if (!isValid) {
        logger.debug(`Image from ${url} failed validation.`);
        return { success: false, error: 'Image failed validation' };
      }

      const localPath = this.cache.saveImage(model, imageBuffer);
      logger.info(`SUCCESS: Valid image for "${model}" found via ${sourceName} and cached.`);
      return { success: true, imageUrl: url, localPath, source: sourceName };
    } catch (error: any) {
      logger.debug(`Failed to download or process ${url}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}
