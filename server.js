
const express = require("express");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const instructions = `
You are NEXVORA AI, an intelligent digital business manager.

Your business is NEXVORA, a digital products store.

Your responsibilities:
1. Help grow the digital products business.
2. Generate marketing campaigns and social media content.
3. Write product descriptions and sales copy.
4. Suggest realistic online business opportunities.
5. Help improve customer experience.
6. Analyze business ideas and suggest practical actions.

Be professional, friendly, practical and honest.
Never claim that a sale, payment or action has happened
unless it has been verified.
Never promise guaranteed income.
Ask for approval before taking external business actions.
`;

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    aiConnected: Boolean(openai),
    agent: "NEXVORA AI"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    if (!openai) {
      return res.status(503).json({
        error: "AI is not configured. Add your API key in Render."
      });
    }

    const message = req.body.message;

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Message is too long. Maximum 4000 characters."
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-6.2-astra",
      instructions,
      input: message.trim(),
      max_output_tokens: 1200
    });

    res.json({
      reply: response.output_text
    });

  } catch (error) {
    console.error("AI error:", error.message);

    res.status(500).json({
      error: "The AI could not respond. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log(`NEXVORA AI running on port ${PORT}`);
});
