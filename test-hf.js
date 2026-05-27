import dotenv from 'dotenv';
dotenv.config();

const url = `https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0`;

async function test() {
  console.log("Testing Hugging Face API...");
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.HF_API_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      body: JSON.stringify({ inputs: "A cat in space" }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`HTTP ${res.status}: ${text}`);
      return;
    }

    const arrayBuffer = await res.arrayBuffer();
    console.log("Success! Image size:", arrayBuffer.byteLength);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
