import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();
app.use(cors());
app.use(express.json());

const HF_KEY = process.env.HF_TOKEN;  // Railway will insert this for you

app.post("/classify", async (req, res) => {
    try {
        const { text } = req.body;

        const response = await fetch(
            "https://api-inference.huggingface.co/models/unitary/toxic-bert",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${HF_KEY}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ inputs: text })
            }
        );

        const data = await response.json();
        res.json(data);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server error" });
    }
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});
