console.log('Starting test script...');
import { startServer } from '../src/server';
import type { Server } from 'http';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ExifReader from 'exifreader';
import { BrowserFactory } from './sources/browser.factory';

let srv: Server | null;

const testModels = [
  'Freet Tanga',                  // Freet Footwear
  'Feelgrounds Original Knit',    // Feelgrounds
  'Vibram FiveFingers KSO EVO',   // Vibram
  'Softstar Primal RunAmoc',      // Softstar Shoes
  'Groundies Universe',           // Groundies
  'Splay Freestyle',              // Splay Athletics
  'Whitin Barefoot Cross-Trainer' // Whitin
];

async function runTests(server: Server): Promise<number> {
  const BASE_PORT = (server.address() as any).port;
  console.log(`🧪 Starting API Test Suite on port ${BASE_PORT}...\n`);
  let successes = 0;
  let failures = 0;

  for (const model of testModels) {
    try {
      process.stdout.write(`- Testing: "${model}"... `);
      const response = await axios.post(`http://localhost:${BASE_PORT}/api/shoe-image`, { model });
      if (response.data.success && response.data.localPath) {
        const localPath = path.join(__dirname, '..', 'public', response.data.localPath);

        if (!fs.existsSync(localPath)) {
          throw new Error(`File not found at ${localPath}`);
        }

        // Validate EXIF data
        const fileBuffer = fs.readFileSync(localPath);
        const tags = ExifReader.load(fileBuffer);

        if (!tags.Copyright || tags.Copyright.description !== 'BareTread.com') {
          throw new Error(`Invalid Copyright: ${tags.Copyright?.description}`);
        }
        if (!tags.Artist || tags.Artist.description !== 'BareTread') {
          throw new Error(`Invalid Artist: ${tags.Artist?.description}`);
        }
        if (!tags.ImageDescription || !tags.ImageDescription.description.includes(model)) {
          throw new Error(`Description missing model: ${tags.ImageDescription?.description}`);
        }
        if (!tags.UserComment) {
          throw new Error('Keywords (UserComment) missing');
        }

        console.log(`✅ SUCCESS (Source: ${response.data.source}, EXIF OK)`);
        successes++;
      } else {
        throw new Error(`API returned success:false or missing localPath`);
      }
    } catch (error: any) {
      console.log(`❌ FAILED (${error.response?.data?.error || error.message})`);
      failures++;
    }
  }

  console.log(`\n--- Test Complete ---`);
  console.log(`✅ Successes: ${successes}`);
  console.log(`❌ Failures: ${failures}`);
  console.log(`---------------------\n`);

  return failures;
}

async function main() {
  const browserFactory = BrowserFactory.getInstance();
  const server = await new Promise<Server>(resolve => {
    const s = startServer(0, () => resolve(s));
  });

  let failures = 0;
  try {
    console.log('Initializing browser...');
    await browserFactory.init();
    console.log('Browser initialized.');
    failures = await runTests(server);
  } catch (e) {
    console.error('Test suite failed with an unhandled exception:', e);
    failures = 1;
  } finally {
    server.close();
    await browserFactory.close();

    // Cleanup generated images
    console.log('🧹 Cleaning up generated images...');
    const imageDir = path.join(__dirname, '..', 'public', 'images');
    const files = fs.readdirSync(imageDir);
    let cleanedFiles = 0;
    for (const file of files) {
      if (file !== 'index.json' && file !== '.gitkeep') {
        fs.unlinkSync(path.join(imageDir, file));
        cleanedFiles++;
      }
    }
    console.log(`🗑️  Removed ${cleanedFiles} image(s).\n`);

    if (failures > 0) {
      console.log(`Exiting with error code 1 due to ${failures} test failure(s).`);
      process.exit(1);
    } else {
      console.log('All tests passed!');
      process.exit(0);
    }
  }
}

main();
