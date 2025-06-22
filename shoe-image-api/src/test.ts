import { startServer } from '../src/server';
const srv = startServer(0);
const BASE_PORT = srv ? (srv.address() as any).port : 3000;
import axios from 'axios';

const testModels = [
  'Vivobarefoot Primus Lite III', // Vivobarefoot
  'Xero Shoes Prio',              // Xero Shoes
  'Be Lenka Trailwalker',         // Be Lenka
  'Joe Nimble nimbleToes',          // Joe Nimble
  'Lems Primal 3',                // Lems
  'Merrell Vapor Glove 6',        // Merrell Barefoot line
  'Topo Athletic ST-5'            // Topo Athletic
];

async function runTests() {
  console.log('🧪 Starting API Test Suite...\n');
  let successes = 0;
  let failures = 0;

  for (const model of testModels) {
    try {
      process.stdout.write(`- Testing: "${model}"... `);
      const response = await axios.post(`http://localhost:${BASE_PORT}/api/shoe-image`, { model });
      if (response.data.success) {
        console.log(`✅ SUCCESS (Source: ${response.data.source})`);
        successes++;
      } else {
        throw new Error('API returned success:false');
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
// Gracefully close the Express server after tests
if (srv) srv.close();
}

// Give the server a moment to start up before running tests
setTimeout(runTests, 2000);
