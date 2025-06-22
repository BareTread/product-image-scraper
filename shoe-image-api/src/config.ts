import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  stagehand: {
    env: (process.env.BROWSERBASE_API_KEY ? 'BROWSERBASE' : 'LOCAL') as 'BROWSERBASE' | 'LOCAL',
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    modelName: process.env.ANTHROPIC_API_KEY ? 'claude-3-5-sonnet-latest' : 'gemini-2.0-flash',
    modelClientOptions: {
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    },
    localBrowserLaunchOptions: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  },
  retailers: {
    zappos: 'https://www.zappos.com',
    amazon: 'https://www.amazon.com',
    rei: 'https://www.rei.com',
  },
  barefoot_brands: [
    'vivobarefoot', 'xero shoes', 'be lenka', 'wildling',
    'lems', 'feelgrounds', 'freet', 'bohempia', 'groundies'
  ],
  scraperService: {
    downloadMaxRetries: parseInt(process.env.SCRAPER_DOWNLOAD_MAX_RETRIES || "3", 10),
    downloadInitialDelayMs: parseInt(process.env.SCRAPER_DOWNLOAD_INITIAL_DELAY_MS || "1000", 10),
    downloadTimeoutMs: parseInt(process.env.SCRAPER_DOWNLOAD_TIMEOUT_MS || "10000", 10),
    userAgent: process.env.SCRAPER_USER_AGENT || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (Compatible; ShoeImageAPI/1.0; +http://example.com/bot)',
    geminiMaxRetries: parseInt(process.env.SCRAPER_GEMINI_MAX_RETRIES || "2", 10),
    geminiInitialDelayMs: parseInt(process.env.SCRAPER_GEMINI_INITIAL_DELAY_MS || "1000", 10),
    bypassGeminiOnFailure: (process.env.SCRAPER_BYPASS_GEMINI_ON_FAILURE || "false").toLowerCase() === "true",
  }
};
