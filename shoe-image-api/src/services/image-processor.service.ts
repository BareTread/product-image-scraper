import sharp from 'sharp';
import { logger } from '../utils/logger';
import { GeminiValidationResult } from './gemini-validator.service';

/**
 * Service responsible for processing images to make them unique for SEO purposes.
 */
export class ImageProcessorService {
  constructor() {
    logger.info('ImageProcessorService initialized');
  }

  /**
   * Applies a series of transformations to an image buffer to make it unique.
   * @param imageBuffer The input image buffer.
   * @param model The shoe model name, to be used in metadata.
   * @returns A promise that resolves with the processed image buffer.
   */
    async makeUnique(
    imageBuffer: Buffer,
    geminiResult: GeminiValidationResult
  ): Promise<Buffer> {
    logger.info(
      `Processing image for "${geminiResult.model}" to make it unique.`
    );

        let image = sharp(imageBuffer); // By default, sharp does not include EXIF data from the input

    // Rotate if Gemini requested OR the image is portrait (>20% taller than wide)
    const metadata = await image.metadata();
    const needsAutoRotate = !geminiResult.rotate && metadata.width && metadata.height && metadata.height > metadata.width * 1.2;
    if (geminiResult.rotate || needsAutoRotate) {
      logger.debug(`Rotating image 90° clockwise${needsAutoRotate ? ' due to portrait aspect ratio' : ' as requested by Gemini'}.`);
      image = image.rotate(90, { background: { r: 255, g: 255, b: 255, alpha: 1 } });
    }

    // 2. Apply a random transformation
    const transformationType = Math.floor(Math.random() * 3); // 0, 1, or 2

    switch (transformationType) {
      case 0:
                logger.debug(`Applying horizontal flip to image for ${geminiResult.model}`);
        image = image.flip();
        break;
      case 1:
        const rotation = (Math.random() - 0.5) * 2; // -1 to +1 degree
                logger.debug(
          `Applying ${rotation.toFixed(2)}deg rotation to image for ${geminiResult.model}`
        );
        image = image.rotate(rotation, { background: { r: 255, g: 255, b: 255, alpha: 1 } });
        break;
      case 2:
                const brightness = 1 + (Math.random() * 0.1 - 0.05); // 0.95 to 1.05
                logger.debug(
          `Applying brightness ${brightness.toFixed(2)} to image for ${geminiResult.model}`
        );
                image = image.modulate({ brightness });
        break;
    }

    // Inject EXIF metadata using the correct withExif method and structure
    const exifData = {
      IFD0: {
        Copyright: 'BareTread.com',
        Artist: 'BareTread',
        ImageDescription: `Official product photo of ${geminiResult.brand} ${geminiResult.model}`,
      },
      Exif: {
        UserComment: (geminiResult.keywords && geminiResult.keywords.length > 0)
          ? geminiResult.keywords.join(', ')
          : `${geminiResult.brand}, ${geminiResult.model}`,
      },
    };

    image = image.withExif(exifData);

    const processedBuffer = await image.toBuffer();

    return processedBuffer;
  }
}
