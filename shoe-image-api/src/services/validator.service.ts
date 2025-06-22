import sharp from 'sharp';
import { logger } from '../utils/logger';

export class ValidatorService {
  async validateImage(imageBuffer: Buffer): Promise<boolean> {
    try {
      const image = sharp(imageBuffer);
      const metadata = await image.metadata();
      const { width, height, channels } = metadata;

      if (!width || !height || !channels) {
        logger.debug('Validation failed: Missing image dimensions or channels.');
        return false;
      }

      // Check a 5px border on all sides for white background
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
        const { data, info } = await image
          .clone()
          .extract(region)
          .raw()
          .toBuffer({ resolveWithObject: true });

        totalPixelCount += info.size / info.channels;

        for (let i = 0; i < data.length; i += info.channels) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          // Check if the pixel is close to white (e.g., RGB > 240)
          if (r > 240 && g > 240 && b > 240) {
            whitePixelCount++;
          }
        }
      }

      const whitePercentage = (whitePixelCount / totalPixelCount) * 100;
      logger.debug(`White background percentage: ${whitePercentage.toFixed(2)}%`);

      // Require at least 95% of the border pixels to be white
      const isValid = whitePercentage > 95;
      if (isValid) {
        logger.debug('Validation passed: Background is predominantly white.');
      } else {
        logger.debug('Validation failed: Background is not white enough.');
      }
      return isValid;
    } catch (error) {
      logger.error('Error during image validation:', error);
      return false;
    }
  }
}
