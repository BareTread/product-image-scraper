import axios from 'axios';
import { ImageSource, ScrapingResult } from '../types';
import { CacheService } from './cache.service';
import { ValidatorService } from './validator.service';
import { GeminiValidatorService } from './gemini-validator.service';
import { ImageProcessorService } from './image-processor.service';
import { SearchEngineSource } from '../sources/search.source';
import { logger } from '../utils/logger';
import { config } from '../config'; // Import config

export class ScraperService {
  private source: ImageSource;
  private cache: CacheService;
  private validator: ValidatorService;
  private geminiValidator: GeminiValidatorService;
  private imageProcessor: ImageProcessorService;

  // Configuration properties
  private downloadMaxRetries: number;
  private downloadInitialDelayMs: number;
  private downloadTimeoutMs: number;
  private userAgent: string;

  constructor() {
    this.source = new SearchEngineSource();
    this.cache = new CacheService();
    this.validator = new ValidatorService();
    this.geminiValidator = new GeminiValidatorService();
    this.imageProcessor = new ImageProcessorService();

    // Load configuration
    this.downloadMaxRetries = config.scraperService.downloadMaxRetries;
    this.downloadInitialDelayMs = config.scraperService.downloadInitialDelayMs;
    this.downloadTimeoutMs = config.scraperService.downloadTimeoutMs;
    this.userAgent = config.scraperService.userAgent;
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
        // Call downloadAndValidate without the config parameters, as they are now class members
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

  private async downloadAndValidate(
    url: string,
    model: string,
    sourceName: string
  ): Promise<ScrapingResult> {
    let currentDelay = this.downloadInitialDelayMs;

    for (let attempt = 1; attempt <= this.downloadMaxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${this.downloadMaxRetries} to download ${url}`);
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: this.downloadTimeoutMs,
          headers: { 'User-Agent': this.userAgent }
        });
        const imageBuffer = Buffer.from(response.data);

        const borderOk = await this.validator.validateImage(imageBuffer);
        if (!borderOk) {
          logger.debug(`Image from ${url} failed basic validation.`);
          // No retry for validation failure, it's not a transient error
          return { success: false, error: 'Image failed basic validation' };
        }

        // Second-tier validation with Gemini (semantic check)
        let geminiResult;
        const geminiMaxRetries = config.scraperService.geminiMaxRetries ?? 2; // Default to 2 if not in config
        const geminiInitialDelayMs = config.scraperService.geminiInitialDelayMs ?? 1000; // Default to 1s
        let geminiCurrentDelay = geminiInitialDelayMs;

        for (let geminiAttempt = 1; geminiAttempt <= geminiMaxRetries; geminiAttempt++) {
          try {
            logger.debug(`Attempt ${geminiAttempt}/${geminiMaxRetries} for Gemini validation of image from ${url}`);
            geminiResult = await this.geminiValidator.validateImage(imageBuffer, model);
            if (geminiResult) {
              break; // Success, exit retry loop
            } else {
              // Gemini explicitly rejected the image (e.g., not a shoe)
              logger.debug(`Gemini validation attempt ${geminiAttempt}/${geminiMaxRetries} rejected image from ${url}. Not retrying for this reason.`);
              // This is not a transient error, so break and let it be handled as LLM validation failed.
              // Or, we could return immediately: return { success: false, error: 'LLM validation failed (rejected)' };
              // For now, breaking will lead to the check after the loop.
              break;
            }
          } catch (geminiError: any) {
            logger.warn(`Gemini validation attempt ${geminiAttempt}/${geminiMaxRetries} for ${url} failed: ${geminiError.message}`);
            if (geminiAttempt === geminiMaxRetries) {
              // All retries failed
              if (config.scraperService.bypassGeminiOnFailure) { // Configurable bypass
                logger.warn(`All Gemini validation attempts for ${url} failed. Bypassing Gemini validation as per configuration.`);
                geminiResult = { model: model, entities: [], themes: [], isShoe: true, shoeType: 'unknown (Gemini bypassed)' }; // Create a dummy success result
                break;
              } else {
                logger.error(`All Gemini validation attempts for ${url} failed. Not bypassing.`);
                return { success: false, error: `LLM validation failed after ${geminiMaxRetries} attempts: ${geminiError.message}` };
              }
            }
            await new Promise(resolve => setTimeout(resolve, geminiCurrentDelay));
            geminiCurrentDelay *= 2; // Exponential backoff
          }
        }

        if (!geminiResult) {
          logger.debug(`Gemini ultimately rejected image from ${url} or all attempts failed.`);
          return { success: false, error: 'LLM validation failed' };
        }

        // Process the image to make it unique for SEO
        // Assuming image processing errors are not typically transient
        const processedBuffer = await this.imageProcessor.makeUnique(imageBuffer, geminiResult);

        const localPath = this.cache.saveImage(geminiResult, processedBuffer);
        logger.info(
          `SUCCESS: Valid image for "${geminiResult.model}" (matched as "${geminiResult.model}") found via ${sourceName} and cached at ${localPath}.`
        );
        return { success: true, imageUrl: url, localPath, source: sourceName };

      } catch (error: any) {
        let errorMessage = error.message;
        if (axios.isAxiosError(error)) {
          errorMessage = `Axios error: ${error.message}`;
          if (error.response) {
            errorMessage += ` (Status: ${error.response.status})`;
          } else if (error.request) {
            errorMessage += ` (No response received)`;
          }
          if (error.code === 'ECONNABORTED') {
            errorMessage += ` (Timeout)`;
          }
        } else if (error instanceof Error) {
          // Handle errors from validation or image processing if they are custom Error types
          // For now, just use their message.
          errorMessage = `Processing error: ${error.message}`;
        }

        logger.warn(`Attempt ${attempt}/${this.downloadMaxRetries} for ${url} failed: ${errorMessage}`);

        if (attempt === this.downloadMaxRetries) {
          logger.error(`All ${this.downloadMaxRetries} attempts to download/process ${url} failed. Last error: ${errorMessage}`);
          return { success: false, error: `Failed to download and process image from ${url} after ${this.downloadMaxRetries} attempts: ${errorMessage}` };
        }

        // Only retry for potentially transient errors (e.g., network issues, timeouts).
        // For other errors (like validation, gemini rejection, processing), we've already returned early.
        // The check "axios.isAxiosError(error)" can be used to be more specific about retrying.
        // For now, the structure assumes any error caught here in the download loop is retryable.
        // If validation errors were not returned immediately, we'd add checks here.

        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay *= 2; // Exponential backoff
      }
    }
    // Should be unreachable due to the return inside the loop on maxRetries
    logger.error(`Exhausted retries for ${url}, but loop finished unexpectedly.`);
    return { success: false, error: `Failed to download image from ${url} after ${this.downloadMaxRetries} attempts (unexpected loop exit).` };
  }
}
