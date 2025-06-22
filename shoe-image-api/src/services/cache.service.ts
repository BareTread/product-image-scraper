import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { GeminiValidationResult } from './gemini-validator.service';

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

  private normalizeKey(model: string): string {
    return model.toLowerCase().replace(/[^a-z0-9]/g, '_');
  }
}
