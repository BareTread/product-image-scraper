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
    const result: ScrapingResult = { // Initialize with model
        success: false,
        model: model,
        geminiValidationStatus: 'n/a',
    };

    const cachedPath = this.cache.getCachedImage(model);
    if (cachedPath) {
      logger.info(`Cache hit for "${model}". Returning cached image.`);
      result.success = true;
      result.finalProcessedPath = cachedPath;
      result.source = 'cache';
      // For cached images, we don't have intermediate steps to show in this flow
      // but we could consider storing them if needed in future.
      // For now, only final path is available from cache.
      return result;
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
    const scrapingResult: ScrapingResult = {
      success: false,
      model: model,
      originalImageUrl: url,
      source: sourceName,
      geminiValidationStatus: 'n/a', // Default status
    };
    let currentDelay = this.downloadInitialDelayMs;

    for (let attempt = 1; attempt <= this.downloadMaxRetries; attempt++) {
      try {
        logger.debug(`Attempt ${attempt}/${this.downloadMaxRetries} to download ${url} for model "${model}"`);
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          timeout: this.downloadTimeoutMs,
          headers: { 'User-Agent': this.userAgent }
        });
        const imageBuffer = Buffer.from(response.data);
        scrapingResult.rawDownloadedPath = this.cache.saveIntermediateImage(model, 'raw-download', imageBuffer);
        // Initially, the image input for Gemini is the raw downloaded one. This might change if basic validation modifies the buffer.
        scrapingResult.geminiInputPath = scrapingResult.rawDownloadedPath;

        const borderOk = await this.validator.validateImage(imageBuffer);
        if (!borderOk) {
          logger.debug(`Image from ${url} failed basic validation.`);
          scrapingResult.error = 'Image failed basic validation';
          // Optionally save this failed image:
          // this.cache.saveIntermediateImage(model, 'basic-validation-failed', imageBuffer);
          return scrapingResult; // Return the partially filled scrapingResult
        }
        // If validator could modify the buffer, we might save another intermediate version here:
        // scrapingResult.postBasicValidationPath = this.cache.saveIntermediateImage(model, 'post-basic-validation', imageBuffer);
        // scrapingResult.geminiInputPath = scrapingResult.postBasicValidationPath;


        // Second-tier validation with Gemini (semantic check)
        // Second-tier validation with Gemini (semantic check)
        let actualGeminiResult: GeminiValidationResult | null = null; // Stores the result from geminiValidator or the dummy bypass result
        const geminiMaxRetries = config.scraperService.geminiMaxRetries ?? 2;
        const geminiInitialDelayMs = config.scraperService.geminiInitialDelayMs ?? 1000;
        let geminiCurrentDelay = geminiInitialDelayMs;

        for (let geminiAttempt = 1; geminiAttempt <= geminiMaxRetries; geminiAttempt++) {
          try {
            logger.debug(`Attempt ${geminiAttempt}/${geminiMaxRetries} for Gemini validation of image from ${url}`);
            // imageBuffer here is the one that passed basic validation
            actualGeminiResult = await this.geminiValidator.validateImage(imageBuffer, model);

            if (actualGeminiResult) {
              scrapingResult.geminiValidationStatus = 'approved';
              // Save the version of the image that Gemini approved.
              scrapingResult.geminiApprovedRawPath = this.cache.saveIntermediateImage(model, 'gemini-approved-raw', imageBuffer);
              // The input to Gemini was the current imageBuffer
              scrapingResult.geminiInputPath = scrapingResult.geminiApprovedRawPath; // Or keep the earlier geminiInputPath if it wasn't modified by basic validation
              logger.info(`Gemini approved image for "${model}" from ${url}.`);
              break; // Success from Gemini
            } else {
              // Gemini explicitly rejected the image (e.g., not a shoe)
              scrapingResult.geminiValidationStatus = 'rejected';
              logger.debug(`Gemini validation attempt ${geminiAttempt}/${geminiMaxRetries} rejected image from ${url}.`);
              scrapingResult.geminiRejectedPath = this.cache.saveIntermediateImage(model, 'gemini-rejected', imageBuffer);
              actualGeminiResult = null; // Ensure it's null if rejected
              break; // Exit retry loop, Gemini has made a decision
            }
          } catch (geminiError: any) {
            logger.warn(`Gemini validation attempt ${geminiAttempt}/${geminiMaxRetries} for ${url} failed: ${geminiError.message}`);
            if (geminiAttempt === geminiMaxRetries) { // Last attempt
              if (config.scraperService.bypassGeminiOnFailure) {
                logger.warn(`All Gemini validation attempts for ${url} failed. Bypassing Gemini validation as per configuration.`);
                scrapingResult.geminiValidationStatus = 'bypassed';
                actualGeminiResult = { model: model, brand: 'Unknown (Bypassed)', entities: [], themes: [], isShoe: true, shoeType: 'unknown (Gemini bypassed)' };
                // Save the image that was attempted with Gemini, even if bypassed
                scrapingResult.geminiInputPath = this.cache.saveIntermediateImage(model, 'gemini-bypassed-input', imageBuffer);
                break; // Exit retry loop, bypassed
              } else {
                logger.error(`All Gemini validation attempts for ${url} failed. Not bypassing.`);
                scrapingResult.error = `LLM validation failed after ${geminiMaxRetries} attempts: ${geminiError.message}`;
                scrapingResult.geminiValidationStatus = 'failed_to_validate';
                return scrapingResult; // Return the partially filled scrapingResult
              }
            }
            await new Promise(resolve => setTimeout(resolve, geminiCurrentDelay));
            geminiCurrentDelay *= 2; // Exponential backoff
          }
        }

        // After the loop, check the outcome
        if (!actualGeminiResult) { // Handles explicit rejection if bypass is off
            logger.debug(`Gemini ultimately rejected image from ${url} and was not bypassed, or another failure occurred.`);
            scrapingResult.error = scrapingResult.error || 'LLM validation failed (Gemini rejected or failed and bypass off)';
            // scrapingResult.geminiRejectedPath should be set if it was an explicit rejection
            return scrapingResult;
        }

        // If Gemini rejected (status is 'rejected') but we are here, it means bypass must have been true (though this path might be less common with current logic)
        // or if actualGeminiResult.isShoe is false from a successful call.
        // We must ensure that if it's 'rejected' and bypass is OFF, we don't proceed.
        if (scrapingResult.geminiValidationStatus === 'rejected' && !config.scraperService.bypassGeminiOnFailure) {
             logger.debug(`Gemini rejected image from ${url} and bypass is OFF. Cannot proceed.`);
             scrapingResult.error = scrapingResult.error || 'LLM validation failed (Gemini rejected and bypass is off)';
             return scrapingResult;
        }
        // Also, if Gemini successfully said it's not a shoe, and it wasn't a bypass scenario
        if (actualGeminiResult && !actualGeminiResult.isShoe && scrapingResult.geminiValidationStatus === 'approved') {
            logger.debug(`Gemini approved the call, but classified image as not a shoe for ${url}.`);
            scrapingResult.geminiValidationStatus = 'rejected'; // Correct status
            scrapingResult.geminiRejectedPath = scrapingResult.geminiApprovedRawPath; // The 'approved' one was actually a rejection content-wise
            scrapingResult.geminiApprovedRawPath = null; // Nullify this
            scrapingResult.error = 'LLM validation: Image is not a shoe.';
            return scrapingResult;
        }


        // Process the image to make it unique for SEO using actualGeminiResult (could be dummy if bypassed)
        const processedBuffer = await this.imageProcessor.makeUnique(imageBuffer, actualGeminiResult);
        // Save the final processed image
        scrapingResult.finalProcessedPath = this.cache.saveImage(actualGeminiResult, processedBuffer);

        scrapingResult.success = true;
        // Update model from Gemini result if it refined it (e.g. from bypass or actual result)
        scrapingResult.model = actualGeminiResult.model;
        logger.info(
          `SUCCESS: Valid image for "${scrapingResult.model}" found via ${sourceName} and cached at ${scrapingResult.finalProcessedPath}. Gemini status: ${scrapingResult.geminiValidationStatus}`
        );
        return scrapingResult;

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
        scrapingResult.error = errorMessage; // Store the last error message

        if (attempt === this.downloadMaxRetries) {
          logger.error(`All ${this.downloadMaxRetries} attempts to download/process ${url} failed. Last error: ${errorMessage}`);
          scrapingResult.error = `Failed to download and process image from ${url} after ${this.downloadMaxRetries} attempts: ${errorMessage}`;
          return scrapingResult; // Return the populated scrapingResult with error
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
    scrapingResult.error = `Failed to download image from ${url} after ${this.downloadMaxRetries} attempts (unexpected loop exit).`;
    return scrapingResult;
  }
}
