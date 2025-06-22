console.log('Starting test script...');
import { startServer } from '../src/server';
import type { Server } from 'http';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import ExifReader from 'exifreader';

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

async function runTests() {
  const BASE_PORT = srv ? (srv.address() as any).port : 3000;
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

  // Cleanup generated images
  console.log('🧹 Cleaning up generated images...');
  const imageDir = path.join(__dirname, '..', 'public', 'images');
  const files = fs.readdirSync(imageDir);
  let cleanedFiles = 0;
  for (const file of files) {
    if (file !== 'index.json' && file !== '.gitkeep') { // Don't delete index or placeholder
      fs.unlinkSync(path.join(imageDir, file));
      cleanedFiles++;
    }
  }
  console.log(`🗑️  Removed ${cleanedFiles} image(s).\n`);

  // Gracefully close the Express server after tests
  if (srv) srv.close();

  // Exit with error code if any tests failed
  if (failures > 0) {
    console.log('Exiting with error code 1 due to test failures.');
    process.exit(1);
  } else {
    process.exit(0);
  }
}

// Start the server and trigger the tests via the onListen callback
srv = startServer(0, runTests);
