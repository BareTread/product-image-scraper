import express from 'express';
import path from 'path';
import { ScraperService } from './services/scraper.service';
import { logger } from './utils/logger';
import { config } from './config';

// Global error handlers to prevent the process from exiting unexpectedly
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  // Do NOT exit the process – we want the API to stay available.
});

export const app = express();
const scraper = new ScraperService();

app.use(express.json());

// Serve frontend files from public_frontend (e.g., index.html, css, client-side js)
app.use(express.static(path.join(__dirname, '../public_frontend')));

// Serve cached images from public/images
app.use('/images', express.static(path.join(__dirname, '../public/images')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/shoe-image', async (req, res) => {
  try {
    const { model } = req.body;
    if (!model || typeof model !== 'string') {
      res.status(400).json({ success: false, error: '`model` (string) is required in the request body.' });
      return;
    }

    const result = await scraper.getShoeImage(model);

    // Helper to construct full URLs for local paths
    const getFullUrl = (localPath: string | null | undefined) => {
      if (!localPath) return null;
      return `${req.protocol}://${req.get('host')}${localPath}`;
    };

    if (result.success && result.finalProcessedPath) {
      res.json({
        success: true,
        model: result.model, // Use model from result as Gemini might refine it
        source: result.source,
        // Include all new paths, making them full URLs
        rawDownloadedPath: getFullUrl(result.rawDownloadedPath),
        geminiInputPath: getFullUrl(result.geminiInputPath),
        geminiApprovedRawPath: getFullUrl(result.geminiApprovedRawPath),
        geminiRejectedPath: getFullUrl(result.geminiRejectedPath),
        finalProcessedPath: getFullUrl(result.finalProcessedPath), // This is the main image
        geminiValidationStatus: result.geminiValidationStatus,
        originalImageUrl: result.originalImageUrl, // The remote URL from where it was scraped
      });
    } else {
      // Even on failure, return any paths that were populated for debugging
      res.status(404).json({
        success: false,
        model: result.model || model,
        error: result.error,
        source: result.source,
        rawDownloadedPath: getFullUrl(result.rawDownloadedPath),
        geminiInputPath: getFullUrl(result.geminiInputPath),
        geminiApprovedRawPath: getFullUrl(result.geminiApprovedRawPath),
        geminiRejectedPath: getFullUrl(result.geminiRejectedPath),
        geminiValidationStatus: result.geminiValidationStatus,
        originalImageUrl: result.originalImageUrl,
      });
    }
  } catch (error: any) {
    logger.error('An unhandled error occurred in the main endpoint:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

import type { Server } from 'http';

export function startServer(port: number | string = config.port, onListen?: () => void): Server {
  const listenPort: number = typeof port === 'string' ? parseInt(port, 10) : port;

  const server: Server = app.listen(listenPort, () => {
      if (process.env.NODE_ENV !== 'test') {
        const address = server.address();
        const port = typeof address === 'string' ? address : address?.port;
        logger.info(`Server running on http://localhost:${port}`);
      }
      onListen?.();
    });

  return server;
}

// If executed directly (not imported), start immediately
if (require.main === module) {
  startServer();
}
