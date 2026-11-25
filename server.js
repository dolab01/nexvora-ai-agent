
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "20kb" }));
app.use(express.static(__dirname));

const crypto = require("crypto");

function dashboardSessionValid(req) {
  const secret = process.env.NEXVORA_DASHBOARD_PASSWORD;
  if (!secret) return false;
  const cookie = String(req.headers.cookie || "").split(";").map(v => v.trim()).find(v => v.startsWith("nexvora_session="));
  if (!cookie) return false;
  const token = decodeURIComponent(cookie.slice("nexvora_session=".length));
  const [expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!Number.isFinite(expires) || expires < Date.now() || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(expiresText).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireDashboardAuth(req, res, next) {
  if (dashboardSessionValid(req)) return next();
  return res.status(401).json({ error: "Please sign in to NEXVORA." });
}

app.post("/api/login", (req, res) => {
  const expected = process.env.NEXVORA_DASHBOARD_PASSWORD || "";
  const supplied = typeof req.body?.password === "string" ? req.body.password : "";
  if (!expected) return res.status(503).json({ error: "Dashboard password is not configured yet." });
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (!a.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: "Incorrect password. Please try again." });
  }
  const expiresText = String(Date.now() + 12 * 60 * 60 * 1000);
  const signature = crypto.createHmac("sha256", expected).update(expiresText).digest("hex");
  res.setHeader("Set-Cookie", "nexvora_session=" + encodeURIComponent(expiresText + "." + signature) + "; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200" + (process.env.NODE_ENV === "production" ? "; Secure" : ""));
  return res.json({ authenticated: true });
});

app.get("/api/session", (req, res) => {
  return res.json({ authenticated: dashboardSessionValid(req), configured: Boolean(process.env.NEXVORA_DASHBOARD_PASSWORD) });
});

app.post("/api/logout", (req, res) => {
  res.setHeader("Set-Cookie", "nexvora_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + (process.env.NODE_ENV === "production" ? "; Secure" : ""));
  return res.json({ loggedOut: true });
});

app.get("/api/sales", requireDashboardAuth, async (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) return res.status(503).json({ error: "Sales database is not configured." });
    const endpoint = new URL("/rest/v1/selar_sales", supabaseUrl);
    endpoint.searchParams.set("select", "external_order_id,product_name,amount,currency,status,sold_at");
    endpoint.searchParams.set("order", "sold_at.desc");
    endpoint.searchParams.set("limit", "500");
    const response = await fetch(endpoint, {
      headers: { "apikey": supabaseKey, "Authorization": "Bearer " + supabaseKey }
    });
    if (!response.ok) {
      console.error("Supabase sales read failed:", response.status, await response.text());
      return res.status(502).json({ error: "Could not load sales from the database." });
    }
    const rows = await response.json();
    return res.json({ sales: rows });
  } catch (error) {
    console.error("Sales read error:", error.message);
    return res.status(500).json({ error: "Could not load sales." });
  }
});


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


app.post("/api/selar/webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.NEXVORA_WEBHOOK_SECRET;
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!webhookSecret || !supabaseUrl || !supabaseKey) {
      return res.status(503).json({ error: "Sales integration is not fully configured." });
    }

    const suppliedSecret = req.get("x-nexvora-secret") || "";
    const expected = Buffer.from(webhookSecret);
    const supplied = Buffer.from(suppliedSecret);
    const crypto = require("crypto");
    if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
      return res.status(401).json({ error: "Unauthorized webhook request." });
    }

    const body = req.body || {};
    const orderId = body.order_id ?? body.orderId ?? body.transaction_id ?? body.transactionId ?? body.id;
    const productName = body.product_name ?? body.productName ?? body.product ?? body.item_name ?? body.itemName;
    const rawAmount = body.amount ?? body.total ?? body.price ?? body.sale_amount ?? body.saleAmount;
    const amount = Number(String(rawAmount ?? "").replace(/[^0-9.-]/g, ""));
    const currency = String(body.currency || body.currency_code || "NGN").trim().toUpperCase();
    const rawDate = body.sold_at ?? body.created_at ?? body.createdAt ?? body.date ?? body.paid_at;
    const parsedDate = rawDate ? new Date(rawDate) : new Date();
    const soldAt = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

    if (!orderId || !productName || !Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        error: "Missing required sale fields. Provide an order ID, product name, and positive amount."
      });
    }

    const status = String(body.status || body.payment_status || "paid").trim().toLowerCase();
    if (!["paid", "successful", "completed", "success"].includes(status)) {
      return res.status(200).json({ received: true, ignored: true, reason: "Sale is not marked as paid." });
    }

    const endpoint = new URL("/rest/v1/selar_sales", supabaseUrl);
    endpoint.searchParams.set("on_conflict", "external_order_id");
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": supabaseKey,
        "Authorization": "Bearer " + supabaseKey,
        "Prefer": "resolution=ignore-duplicates,return=minimal"
      },
      body: JSON.stringify([{
        external_order_id: String(orderId).trim(),
        product_name: String(productName).trim().slice(0, 250),
        amount,
        currency: currency.slice(0, 8),
        status: "paid",
        sold_at: soldAt
      }]),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("Supabase sales insert failed:", response.status, detail);
      return res.status(502).json({ error: "Could not save the sale to the database." });
    }

    return res.status(200).json({ received: true, saved: true });
  } catch (error) {
    console.error("Selar webhook error:", error.message);
    return res.status(500).json({ error: "The sale could not be processed." });
  }
});

app.post("/api/chat", requireDashboardAuth, async (req, res) => {
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
        signal: AbortSignal.timeout(55000),
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
