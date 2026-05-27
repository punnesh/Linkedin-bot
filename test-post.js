import dotenv from 'dotenv';
import { generatePost } from './src/generator.js';

dotenv.config();

async function run() {
  console.log("Generating the test post for analysis...\n");
  const result = await generatePost("Microsoft stopped using claude", "INSIGHT");
  console.log("--- GENERATED POST ---");
  console.log(result.post);
  console.log("----------------------");
}

run().catch(console.error);
