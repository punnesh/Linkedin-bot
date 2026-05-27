import dotenv from 'dotenv';
import { proposeTopics } from './src/generator.js';

dotenv.config();

async function run() {
  console.log("Brainstorming 5 organic topics based on current trends...\n");
  const topics = await proposeTopics();
  console.log("--- GENERATED TOPICS ---");
  topics.forEach((t, i) => {
    console.log(`[ ${i + 1} ] ${t.topic}\n      Angle: ${t.angle}\n`);
  });
  console.log("------------------------");
}

run().catch(console.error);
