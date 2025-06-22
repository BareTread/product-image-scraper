import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from "@google/generative-ai";
import { logger } from "../utils/logger";

/**
 * GeminiValidatorService uses Google Generative-AI "gemini-1.5-flash" (Vision)
 * to confirm that an image actually shows the requested shoe model on a white
 * background. The model returns `{ "valid": true | false }` – we parse it and
 * treat `true` as a pass. Any JSON parsing errors, safety blocks or
 * networking errors result in a validation failure (return `false`).
 */
export class GeminiValidatorService {
  private geminiClient: GoogleGenerativeAI;

  constructor(private readonly apiKey: string | undefined = process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    if (!apiKey) {
      throw new Error("GOOGLE_GENERATIVE_AI_API_KEY not set in environment");
    }
    this.geminiClient = new GoogleGenerativeAI(apiKey);
  }

  async validateImage(imageBuffer: Buffer, shoeModel: string): Promise<boolean> {
    try {
      const model = this.geminiClient.getGenerativeModel({ model: "gemini-1.5-flash" });
      const base64 = imageBuffer.toString("base64");
      const prompt = `You are an expert product-image inspector. Reply ONLY with valid JSON {\"valid\":true} or {\"valid\":false}. Is this a studio product photo of the model \"${shoeModel}\" on a white background? Reply false if any doubt.`;

      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { data: base64, mimeType: "image/jpeg" } },
              { text: prompt }
            ]
          }
        ],
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ]
      });

      const text = result.response.text();
      const match = text.match(/\{[\s\S]*?\}/);
      if (!match) {
        logger.debug("Gemini response did not contain JSON – failing validation");
        return false;
      }
      const json = JSON.parse(match[0]);
      return json.valid === true;
    } catch (err) {
      logger.error("Gemini validation error:", err);
      return false;
    }
  }
}
