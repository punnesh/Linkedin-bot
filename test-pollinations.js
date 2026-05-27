import fs from 'fs';

async function testPollinations() {
  const prompt = encodeURIComponent("A minimalist vector art of a coffee cup on a desk, soft lighting, professional linkedin banner style");
  // Using model=flux for high quality, width/height for standard linkedin post size
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1080&height=1080&nologo=true&model=flux`;

  console.log("Fetching image from Pollinations...");
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`HTTP Error: ${res.status} ${res.statusText}`);
      return;
    }
    
    // Convert arrayBuffer to Node Buffer
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    fs.writeFileSync('pollinations_test.jpg', buffer);
    console.log(`✅ Success! Image saved to pollinations_test.jpg (${buffer.length} bytes)`);
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}

testPollinations();
