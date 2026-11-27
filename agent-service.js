const crypto = require("crypto");

module.exports = function registerAgentRoutes(app, requireDashboardAuth) {
  function dbConfig() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase is not configured.");
    return { url, key };
  }

  async function dbRequest(table, { method = "GET", query = "", body, prefer } = {}) {
    const { url, key } = dbConfig();
    const endpoint = new URL("/rest/v1/" + table, url);
    if (query) endpoint.search = query;
    const headers = {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json"
    };
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(endpoint, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000)
    });
    const raw = await response.text();
    if (!response.ok) {
      console.error("NEXVORA database error:", table, response.status, raw);
      throw new Error("Database request failed (" + response.status + "). Check the NEXVORA database setup.");
    }
    return raw ? JSON.parse(raw) : [];
  }

  async function addActivity(eventType, title, detail = "") {
    try {
      await dbRequest("nexvora_activity", {
        method: "POST",
        query: "select=id",
        prefer: "return=minimal",
        body: [{
          event_type: eventType,
          title: String(title).slice(0, 180),
          detail: String(detail).slice(0, 1000)
        }]
      });
    } catch (error) {
      console.error("NEXVORA activity log failed:", error.message);
    }
  }

  app.get("/api/agent/overview", requireDashboardAuth, async (req, res) => {
    try {
      const [tasks, approvals, activity] = await Promise.all([
        dbRequest("nexvora_agent_tasks", { query: "select=id,title,description,status,priority,created_at,updated_at&order=created_at.desc&limit=50" }),
        dbRequest("nexvora_approvals", { query: "select=id,action_type,title,description,status,created_at,decided_at&order=created_at.desc&limit=50" }),
        dbRequest("nexvora_activity", { query: "select=id,event_type,title,detail,created_at&order=created_at.desc&limit=30" })
      ]);
      res.json({ tasks, approvals, activity });
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  app.post("/api/agent/tasks", requireDashboardAuth, async (req, res) => {
    try {
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      const priority = ["low", "normal", "high"].includes(req.body?.priority) ? req.body.priority : "normal";
      if (!title || title.length > 180) return res.status(400).json({ error: "Enter a task title (maximum 180 characters)." });
      const rows = await dbRequest("nexvora_agent_tasks", {
        method: "POST",
        query: "select=id,title,description,status,priority,created_at",
        prefer: "return=representation",
        body: [{ title, description: description.slice(0, 2000), priority, status: "queued", source: "dashboard" }]
      });
      await addActivity("task_created", "Task added to agent queue", title);
      res.status(201).json({ task: rows[0] });
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  app.patch("/api/agent/tasks/:id", requireDashboardAuth, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Invalid task ID." });
      const status = req.body?.status;
      if (!["queued", "in_progress", "completed", "failed", "cancelled"].includes(status)) {
        return res.status(400).json({ error: "Invalid task status." });
      }
      const rows = await dbRequest("nexvora_agent_tasks", {
        method: "PATCH",
        query: "id=eq." + encodeURIComponent(id) + "&select=id,title,status,updated_at",
        prefer: "return=representation",
        body: { status, updated_at: new Date().toISOString() }
      });
      if (!rows.length) return res.status(404).json({ error: "Task not found." });
      await addActivity("task_status", "Task status changed", rows[0].title + " → " + status);
      res.json({ task: rows[0] });
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  app.post("/api/agent/approvals", requireDashboardAuth, async (req, res) => {
    try {
      const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      const actionType = typeof req.body?.action_type === "string" ? req.body.action_type.trim() : "external_action";
      if (!title || title.length > 180) return res.status(400).json({ error: "Enter an approval title (maximum 180 characters)." });
      const rows = await dbRequest("nexvora_approvals", {
        method: "POST",
        query: "select=id,title,description,action_type,status,created_at",
        prefer: "return=representation",
        body: [{ title, description: description.slice(0, 2000), action_type: actionType.slice(0, 60), status: "pending" }]
      });
      await addActivity("approval_requested", "Approval requested", title);
      res.status(201).json({ approval: rows[0] });
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });

  app.post("/api/agent/approvals/:id/decision", requireDashboardAuth, async (req, res) => {
    try {
      const id = String(req.params.id || "");
      const decision = req.body?.decision;
      if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: "Invalid approval ID." });
      if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Decision must be approved or rejected." });
      const rows = await dbRequest("nexvora_approvals", {
        method: "PATCH",
        query: "id=eq." + encodeURIComponent(id) + "&status=eq.pending&select=id,title,status,decided_at",
        prefer: "return=representation",
        body: { status: decision, decided_at: new Date().toISOString() }
      });
      if (!rows.length) return res.status(409).json({ error: "This approval is no longer pending." });
      await addActivity("approval_decided", "Approval " + decision, rows[0].title);
      res.json({ approval: rows[0] });
    } catch (error) {
      res.status(503).json({ error: error.message });
    }
  });
};
