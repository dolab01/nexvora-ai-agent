# NEXVORA Business Manager

NEXVORA is an AI-assisted digital-business workspace. It includes an AI assistant, product and sales records, marketing tools, a task tracker, and an operations dashboard.

## Current deployment

- App: https://nexvora-ai-agent.onrender.com
- Health check: https://nexvora-ai-agent.onrender.com/api/health
- Hosting: Render
- AI provider: Groq
- Database: Supabase

## Operations dashboard setup

The task queue, approval centre, and persistent activity history use three Supabase tables.

1. Open your Supabase project.
2. Open **SQL Editor** and choose **New query**.
3. Open `nexvora_schema.sql` in this repository and copy its full contents.
4. Paste the SQL into Supabase SQL Editor and click **Run** once.
5. Return to the NEXVORA dashboard, sign in, open **Operations**, and click **Refresh**.

The Supabase service-role key must remain in Render Environment Variables. Never place it in browser code or share it in chat.

## Safety and execution status

- AI-generated plans and content are drafts until reviewed.
- Items in the agent task queue are tracked work items; they are not automatically executed just because they are queued.
- Approval records capture the owner's decision. An approval record does not itself perform the external action.
- Payments, purchases, publishing, and sensitive account changes require explicit owner approval.
- Selar sales are only recorded when a valid sale event reaches the protected webhook and is saved in Supabase. A Gmail-to-webhook automation must be fully configured and tested before it is described as live.

## Environment variables

Existing deployment variables are expected to include:

- `GROQ_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXVORA_WEBHOOK_SECRET`
- `NEXVORA_DASHBOARD_PASSWORD`

Keep all secrets server-side in Render. Do not commit secrets to this repository.
