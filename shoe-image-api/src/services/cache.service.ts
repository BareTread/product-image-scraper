import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GeminiValidationResult } from './gemini-validator.service';
import { logger } from '../utils/logger'; // Import logger

export class CacheService {
  private cacheDir = path.join(__dirname, '../../public/images');
  private cacheIndex: Map<string, string> = new Map();

  constructor() {
    this.ensureCacheDir();
    this.loadCacheIndex();
  }

  private ensureCacheDir() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCacheIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    if (fs.existsSync(indexPath)) {
      const data = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
      this.cacheIndex = new Map(Object.entries(data));
    }
  }

  private saveCacheIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    const data = Object.fromEntries(this.cacheIndex);
    fs.writeFileSync(indexPath, JSON.stringify(data, null, 2));
  }

  private generateSeoFilename(geminiResult: GeminiValidationResult): string {
    const { brand, model } = geminiResult;
    const slug = `${brand} ${model} side view`
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    return `${slug}.jpg`;
  }

  getCachedImage(model: string): string | null {
    const key = this.normalizeKey(model);
    const filename = this.cacheIndex.get(key);

    if (filename && fs.existsSync(path.join(this.cacheDir, filename))) {
      return `/images/${filename}`;
    }

    return null;
  }

  saveImage(
    geminiResult: GeminiValidationResult,
    imageBuffer: Buffer
  ): string {
    const filename = this.generateSeoFilename(geminiResult);
    const filepath = path.join(this.cacheDir, filename);

    fs.writeFileSync(filepath, imageBuffer);

    const key = this.normalizeKey(geminiResult.model);
    this.cacheIndex.set(key, filename);
    this.saveCacheIndex();

    return `/images/${filename}`;
  }

  // Generates a filename for intermediate images.
  // Example: "Nike Air Max-raw.jpg"
  private generateIntermediateFilename(normalizedModelKey: string, stage: string): string {
    const safeStage = stage.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    return `${normalizedModelKey}-${safeStage}.jpg`;
  }

  // Saves an intermediate image and returns its web path.
  // These are not added to the main cache index.
  saveIntermediateImage(
    modelInput: string, // The original model string from the request
    stage: string,      // e.g., "raw-download", "gemini-input", "gemini-rejected"
    imageBuffer: Buffer
  ): string | null {
    try {
      const normalizedModelKey = this.normalizeKey(modelInput);
      // It's possible geminiResult is not available for very early stages,
      // so we use normalizedModelKey for a consistent base filename.
      const filename = this.generateIntermediateFilename(normalizedModelKey, stage);
      const filepath = path.join(this.cacheDir, filename);

      fs.writeFileSync(filepath, imageBuffer);
      return `/images/${filename}`;
    } catch (error: any) {
      logger.error(`Failed to save intermediate image for model "${modelInput}", stage "${stage}": ${error.message}`);
      return null;
    }
  }

  private normalizeKey(model: string): string {
    return model.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }
}
