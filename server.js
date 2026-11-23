
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

const MODEL = "openai/gpt-oss-120b";

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
Never promise guaranteed income.
Never claim a sale or payment happened unless verified.
Ask for approval before taking external business actions.
`;

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    aiConnected: Boolean(process.env.GROQ_API_KEY),
    agent: "NEXVORA AI",
    provider: "Groq",
    model: MODEL
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      return res.status(503).json({
        error: "Groq API key is missing in Render."
      });
    }

    const message = req.body?.message;

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

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "system",
              content: instructions
            },
            {
              role: "user",
              content: message.trim()
            }
          ],
          temperature: 0.7,
          max_completion_tokens: 1200
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Groq API error:",
        response.status,
        data.error?.message || JSON.stringify(data)
      );

      return res.status(502).json({
        error: "Groq could not respond. Check Render logs for details."
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      console.error("Empty Groq response:", JSON.stringify(data));

      return res.status(502).json({
        error: "Groq returned an empty response."
      });
    }

    res.json({ reply });

  } catch (error) {
    console.error("Server error:", error.message);

    res.status(500).json({
      error: "The AI could not respond. Please try again."
    });
  }
});

app.listen(PORT, () => {
  console.log("NEXVORA AI running on port " + PORT);
});
