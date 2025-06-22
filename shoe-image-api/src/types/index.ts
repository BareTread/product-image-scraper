export interface ImageSource {
  name: string;
  priority: number;
  searchImage(model: string): Promise<string[]>;
}

export interface ValidationResult {
  isValid: boolean;
  confidence: number;
  reason: string;
}

export interface ScrapingResult {
  success: boolean;
  imageUrl?: string;
  localPath?: string;
  source?: string;
  error?: string;
}
