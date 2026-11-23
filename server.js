
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

const instructions = `
You are NEXVORA AI, an intelligent digital business manager.
Your business is NEXVORA, a digital products store.

Help grow the business, create marketing campaigns,
write product descriptions, suggest realistic online
business opportunities and improve customer experience.

Be professional, friendly, practical and honest.
Never promise guaranteed income.
Never claim a sale or payment happened unless verified.
Ask for approval before taking external business actions.
`;

app.get("/api/health", (req, res) => {
  res.json({
    status: "online",
    aiConnected: Boolean(process.env.GEMINI_API_KEY),
    agent: "NEXVORA AI",
    provider: "Google Gemini"
  });
});

app.post("/api/chat", async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    const message = req.body.message;

    if (!apiKey) {
      return res.status(503).json({
        error: "Gemini API key is missing in Render."
      });
    }

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Please enter a message."
      });
    }

    if (message.length > 4000) {
      return res.status(400).json({
        error: "Message is too long."
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.8-flash",
          input: instructions + "\n\nUser request: " + message.trim()
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error(
        "Gemini API error:",
        response.status,
        JSON.stringify(data.error || data)
      );

      return res.status(502).json({
        error: "Gemini API error. Check Render logs for details."
      });
    }

    const reply = data.output_text ||
      (data.steps || [])
        .filter(step => step.type === "model_output")
        .flatMap(step => step.content || [])
        .filter(part => part.type === "text")
        .map(part => part.text)
        .join("\n");

    if (!reply) {
      console.error("Gemini returned no text:", JSON.stringify(data));

      return res.status(502).json({
        error: "Gemini returned an empty response."
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
