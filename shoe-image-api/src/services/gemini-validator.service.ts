import {
  GoogleGenerativeAI,
  HarmBlockThreshold,
  HarmCategory,
  GenerateContentRequest,
  GenerativeModel,
  GenerateContentResult,
  GenerationConfig,
} from "@google/generative-ai";
import { logger } from "../utils/logger";
import sharp from 'sharp';

const GEMINI_TIMEOUT_MS = 15000; // 15 seconds

/**
 * Wraps a Gemini API call with a timeout.
 * @param model The GenerativeModel instance.
 * @param request The content generation request.
 * @param timeout The timeout in milliseconds.
 * @returns A promise that resolves with the generation result or rejects on timeout.
 */
/**
 * Represents the structured data we expect back from the Gemini API.
 */
export interface GeminiValidationResult {
  usable: boolean;
  brand: string;
  model: string;
  keywords: string[];
  rotate?: boolean; // true if image should be rotated 90° clockwise
}

function generateContentWithTimeout(
  model: GenerativeModel,
  request: GenerateContentRequest,
  timeout: number
): Promise<GenerateContentResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Gemini API call timed out after ${timeout}ms`));
    }, timeout);

    model.generateContent(request).then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

/**
 * GeminiValidatorService uses Google Generative-AI "gemini-1.5-flash" (Vision)
 * to confirm that an image actually shows the requested shoe model on a white
 * background. The model returns `{ "valid": true | false }` – we parse it and
 * treat `true` as a pass. Any JSON parsing errors, safety blocks or
 * networking errors result in a validation failure (return `false`).
 */
export class GeminiValidatorService {
  private async isBackgroundWhite(imageBuffer: Buffer): Promise<boolean> {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const { width, height } = metadata;

      if (!width || !height) {
        logger.debug('Validation failed: Missing image dimensions.');
        return false;
      }

      const borderSize = Math.min(5, Math.floor(width / 10), Math.floor(height / 10));
      if (borderSize <= 0) {
        logger.debug('Validation failed: Image too small for border analysis.');
        return false;
      }

      const regions = [
        { left: 0, top: 0, width: width, height: borderSize }, // Top
        { left: 0, top: height - borderSize, width: width, height: borderSize }, // Bottom
        { left: 0, top: 0, width: borderSize, height: height }, // Left
        { left: width - borderSize, top: 0, width: borderSize, height: height }, // Right
      ];

      let whitePixelCount = 0;
      let totalPixelCount = 0;

      for (const region of regions) {
        const { data, info } = await image.clone().extract(region).raw().toBuffer({ resolveWithObject: true });
        totalPixelCount += info.size / info.channels;
        for (let i = 0; i < data.length; i += info.channels) {
          if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240) {
            whitePixelCount++;
          }
        }
      }

      const whitePercentage = (whitePixelCount / totalPixelCount) * 100;
      logger.debug(`White background percentage: ${whitePercentage.toFixed(2)}%`);

      const isValid = whitePercentage > 95;
      if (isValid) {
        logger.debug('Validation passed: Background is predominantly white.');
      } else {
        logger.debug('Validation failed: Background is not white enough.');
      }
      return isValid;
    } catch (error: any) {
      if (error.message.includes('unsupported image format')) {
        logger.debug('Validation failed: Unsupported image format.');
      } else {
        logger.error('Error during white background check:', error);
      }
      return false;
    }
  }
  private geminiClient: GoogleGenerativeAI;

    constructor(
    private readonly apiKey: string | undefined = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  ) {
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not set in environment");
    }
    this.geminiClient = new GoogleGenerativeAI(apiKey);
  }

    async validateImage(
    imageBuffer: Buffer,
    shoeModel: string
  ): Promise<GeminiValidationResult | null> {
    // Step 1: Perform the local, fast white background check first.
    const hasWhiteBg = await this.isBackgroundWhite(imageBuffer);
    if (!hasWhiteBg) {
      return null; // Fails validation early
    }

    // Step 2: If background is okay, proceed with the expensive Gemini check.
    try {
      const model = this.geminiClient.getGenerativeModel({ model: "gemini-1.5-flash" });
      const base64 = imageBuffer.toString("base64");
            const prompt = `You are an AI assistant helping an e-commerce shoe store ("BareTread"). Examine the supplied image of a "${shoeModel}" and answer in MINIFIED JSON ONLY matching this TypeScript interface:
{\"usable\":boolean,\"brand\":string,\"model\":string,\"keywords\":string[],\"rotate\":boolean}

Definition of *usable*:
• Shows ONE shoe (or pair) clearly.
• Plain or mostly-white backdrop (minor shadows OK).
• No large watermarks or big text overlays.
• Any angle (side, angled, top) is acceptable.
• Colour or slight style variations are fine as long as it is the same product line.

Set \`rotate\` to true ONLY if a 90° clockwise rotation would present the shoe in a more standard landscape orientation (e.g., tall/vertical layout). Otherwise false.
Populate brand/model with best guess strings; keywords = 3-5 SEO phrases including brand + model.`;

            const generationConfig: GenerationConfig = {
        responseMimeType: 'application/json',
        temperature: 0.2,
      };

      const request: GenerateContentRequest = {
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data: base64, mimeType: "image/jpeg" } },
              { text: prompt },
            ],
          },
        ],
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.BLOCK_NONE,
          },
        ],
      };

            const result = await generateContentWithTimeout(
        model,
        { ...request, generationConfig },
        GEMINI_TIMEOUT_MS
      );

            const json = JSON.parse(result.response.text()) as GeminiValidationResult;
      if (json.rotate === undefined) json.rotate = false;

      if (!json.usable) {
        logger.debug(`Gemini rejected image for "${shoeModel}" as not usable.`);
        return null;
      }

      // Return the full structured data object
      return json;
    } catch (err: any) {
            // Log the specific error, including our custom timeout error
            logger.error(`Gemini validation error: ${err.message}`);
      return null;
    }
  }
}
