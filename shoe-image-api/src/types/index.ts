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
  model?: string; // Added model for clarity in results
  source?: string;
  error?: string;

  // Paths for different stages of the image
  rawDownloadedPath?: string | null;
  geminiInputPath?: string | null; // Image that was sent to Gemini
  geminiApprovedRawPath?: string | null; // Image that Gemini approved, before final processing
  geminiRejectedPath?: string | null; // Image that Gemini explicitly rejected (if saved)
  finalProcessedPath?: string | null; // The final, processed image (renaming localPath for clarity)

  // Status from Gemini
  geminiValidationStatus?: 'approved' | 'rejected' | 'bypassed' | 'failed_to_validate' | 'n/a';

  // Original remote URL if available
  originalImageUrl?: string | null; // Renaming imageUrl for clarity
}
