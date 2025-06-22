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
      stealth: true,
      humanDelay: { minMs: 200, maxMs: 600 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--lang=en-US,en',
        '--window-size=1280,800',
      ]
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
  ]
};
