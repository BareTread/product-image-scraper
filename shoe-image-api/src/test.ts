import '../src/server';
import axios from 'axios';

const testModels = [
  'Vivobarefoot Primus Lite III',
  'Xero Shoes Prio',
  'Be Lenka Velocity',
  'Wildling Tanuki',
  'Lems Primal 2'
];

async function runTests() {
  console.log('🧪 Starting API Test Suite...\n');
  let successes = 0;
  let failures = 0;

  for (const model of testModels) {
    try {
      process.stdout.write(`- Testing: "${model}"... `);
      const response = await axios.post('http://localhost:3000/api/shoe-image', { model });
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
}

// Give the server a moment to start up before running tests
setTimeout(runTests, 2000);
