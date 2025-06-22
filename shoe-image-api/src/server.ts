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

const app = express();
const scraper = new ScraperService();

app.use(express.json());
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

    if (result.success && result.localPath) {
      res.json({
        success: true,
        model,
        source: result.source,
        imageUrl: `${req.protocol}://${req.get('host')}${result.localPath}`
      });
    } else {
      res.status(404).json({ success: false, model, error: result.error });
    }
  } catch (error: any) {
    logger.error('An unhandled error occurred in the main endpoint:', error);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

app.listen(config.port, () => {
  logger.info(`Server running on http://localhost:${config.port}`);
});
