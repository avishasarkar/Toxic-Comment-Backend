import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import helmet from "helmet";


const app = express();
app.use(cors({
    origin: [
   "chrome-extension://your-extension-id", //change ext id 
   "https://www.youtube.com"
],
    credentials: true
}));
app.use(express.json({ limit: "10kb"}));

const HF_TOKEN = process.env.HF_TOKEN;  // Railway will insert this for you
if (!HF_TOKEN){
    console.error("HF_TOKEN not set in environment variables.")
    process.exit(1)
}

// Basic cache to avoid duplicate HF calls while scanning many comments
const cache = new Map(); // key: text, value: { toxicity: number, ts: timestamp }
const CACHE_TTL = 1000 * 60 * 10; // 10 minutes

async function classifyToxicity(text) {
  // Use HF Inference API (unitary/toxic-bert)
  const res = await fetch("https://api-inference.huggingface.co/models/unitary/toxic-bert", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${HF_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ inputs: text })
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HF API error: ${res.status} ${body}`);
  }

  const json = await res.json();
  // HuggingFace returns array-of-arrays with labels & scores
  // e.g. [[{label:"toxic", score:0.9}, ...]]
//   let toxicity = 0;
  if (Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error("Unexpected HuggingFace response format.");
  }

  const predictions = json[0];


  const TOXICITY_THRESHOLDS = {  // change these threshold these are default
    toxic: 0.60,
    severe_toxic: 0.55,
    obscene: 0.55,
    insult: 0.55,
    identity_hate: 0.50,
    threat: 0.50
  };

  // Normalize labels to lowercase
  const scores = {};
  predictions.forEach(entry => {
    const label = entry.label.toLowerCase().replace(" ", "_"); 
    scores[label] = entry.score;
  });

    // Check if any label exceeds its threshold → NSFW
  let isNSFW = false;
  for (const label in TOXICITY_THRESHOLDS) {
    const th = TOXICITY_THRESHOLDS[label];
    const score = scores[label] || 0;

    if (score >= th) {
      isNSFW = true;
      break;
    }
}

  return {
    nsfw: isNSFW,
    scores,
    thresholds: TOXICITY_THRESHOLDS
  };
}

app.post("/predict", async (req, res) => {
  try {
    const text = (req.body.text || "").toString().trim();
    if (!text) {
      return res.status(400).json({ error: "text required" });
    }

    const now = Date.now();
    const cached = cache.get(text);

    if (cached && now - cached.ts < CACHE_TTL) {
      return res.json({
        nsfw: cached.result.nsfw,
        scores: cached.result.scores,
        thresholds: cached.result.thresholds,
        cached: true
      });
    }

    const result = await classifyToxicity(text);
    cache.set(text, { result, ts: now });

    res.json({
      nsfw: result.nsfw,
      scores: result.scores,
      thresholds: result.thresholds,
      cached: false
    });

  } catch (err) {
    console.error("Error /predict:", err);
    res.status(500).json({ error: err.message || "server error" });
  }
});  

app.get("/", (req, res) => {
  res.send("Backend is running.");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port ${PORT}");
});
