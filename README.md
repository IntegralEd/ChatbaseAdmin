# ChatbaseAdmin

Internal ops application for reviewing Chatbase conversations and managing training changes.

**This is NOT a public-facing chatbot.** It is an internal tool for authorised team members to:
- Review conversation history synced from Chatbase
- Mark message feedback (positive/negative)
- Manage prompt and content change requests
- Trigger and monitor sync jobs

---

## Architecture

```
Browser (internal user)
        |
        | HTTPS
        v
 Next.js 14 App Router (Vercel)
 ┌────────────────────────────────────────────────────────┐
 │  /admin/*           Server components (read from AT)   │
 │  /admin/layout.tsx  Sidebar nav                        │
 │                                                        │
 │  /api/sync/*        POST routes (write to AT + CB)     │
 │  /api/webhooks/*    POST routes (Airtable automation)  │
 │  /api/health        GET (no auth)                      │
 └───────────┬─────────────────────────┬──────────────────┘
             │                         │
      Bearer token               Bearer token
             │                         │
             v                         v
     ┌───────────────┐       ┌──────────────────┐
     │  Airtable API │       │  Chatbase API    │
     │  (base: appy…)│       │  (chatbase.co)   │
     └───────────────┘       └──────────────────┘

Airtable automation → POST /api/webhooks/airtable/review-created
```

---

## Environment Variables

| Variable               | Required | Description                                                                 |
|------------------------|----------|-----------------------------------------------------------------------------|
| `CHATBASE_API_KEY`     | Yes      | Chatbase API key from chatbase.co dashboard                                |
| `AIRTABLE_API_KEY`     | Yes      | Airtable personal access token (not legacy API key)                        |
| `AIRTABLE_BASE_ID`     | Yes      | Airtable base ID — default `appy5x5vC5HjN3Ukq`                            |
| `INTERNAL_ADMIN_TOKEN` | Yes      | Shared secret for all protected API routes. Generate: `openssl rand -hex 32` |
| `VERCEL_URL`           | Auto     | Set automatically by Vercel; used by webhook route for internal fetch base URL |

---

## API Routes

| Method | Path                                        | Auth    | Description                                          |
|--------|---------------------------------------------|---------|------------------------------------------------------|
| GET    | `/api/health`                               | None    | Health check — returns status, timestamp, version    |
| POST   | `/api/sync/conversations`                   | Bearer  | Sync conversations from Chatbase → Airtable          |
| POST   | `/api/sync/messages`                        | Bearer  | Sync messages for one conversation → Airtable        |
| POST   | `/api/sync/message-feedback`                | Bearer  | Patch feedback on Chatbase + update Airtable         |
| POST   | `/api/sync/update-chatbot`                  | Bearer  | Update chatbot instructions/source in Chatbase + AT  |
| POST   | `/api/webhooks/airtable/review-created`     | Bearer  | Airtable automation hook: positive review → Chatbase |

All protected routes require: `Authorization: Bearer <INTERNAL_ADMIN_TOKEN>`

### Request bodies

**POST /api/sync/conversations**
```json
{ "chatbotId": "optional-chatbase-id" }
```

**POST /api/sync/messages**
```json
{ "conversationId": "chatbase-conversation-id" }
```

**POST /api/sync/message-feedback**
```json
{ "messageId": "...", "conversationId": "...", "feedback": "positive" | "negative" | null }
```

**POST /api/sync/update-chatbot**
```json
{
  "chatbotId": "...",
  "sourceText": "optional new source",
  "instructions": "optional new instructions",
  "dryRun": false
}
```

**POST /api/webhooks/airtable/review-created**
```json
{ "recordId": "airtable-message-review-record-id" }
```

---

## Known Schema Mismatches

These are intentional discrepancies in the Airtable schema that all developers must be aware of:

### 1. `Chatbase__Idenitifer` — double underscore, misspelled "Identifier"

The primary external ID field on the `Chatbase_Chatbots` table is named:
```
Chatbase__Idenitifer
```
(two underscores, "Idenitifer" not "Identifier"). Use this exact string in all Airtable reads/writes.

### 2. `Prompt_Change_Requests.Source_Message_Links` links to Conversations, not Messages

Despite the name "Message_Links", this field on `Prompt_Change_Requests` (tblalr4AqofO1cpZQ) links to `Chatbase_Conversations` (tblV1K2KQUrI8PAmt).

Compare: `Content_Change_Requests.Source_Message_Links` (tblBLkBmSaAib0WLr) correctly links to `Chatbase_Messages` (tblAMrcshFzNUYx5g).

Both fields are named identically — the target table differs.

---

## Airtable Table IDs

Defined as constants in `src/lib/constants.ts`:

| Constant                | Table ID             | Table Name                |
|-------------------------|----------------------|---------------------------|
| `TABLES.USERS`          | tbl7Z5w12sAh3lx2A   | Users                     |
| `TABLES.CHATBOTS`       | tblALOX2TYrzWPVKe   | Chatbase_Chatbots         |
| `TABLES.CONVERSATIONS`  | tblV1K2KQUrI8PAmt   | Chatbase_Conversations    |
| `TABLES.MESSAGES`       | tblAMrcshFzNUYx5g   | Chatbase_Messages         |
| `TABLES.MESSAGE_REVIEWS`| tblVYqPsI2vLZqwez   | Message_Reviews           |
| `TABLES.PROMPT_CHANGE_REQUESTS` | tblalr4AqofO1cpZQ | Prompt_Change_Requests |
| `TABLES.CONTENT_CHANGE_REQUESTS` | tblBLkBmSaAib0WLr | Content_Change_Requests |
| `TABLES.SYNC_JOBS`      | tbllNdfrQq45ZcHSF   | Sync_Jobs                 |
| `TABLES.CHATBASE_USERS` | tblL7n2Kh6tK4mq6l   | Chatbase_Users_Table      |

---

## Local Development

### Prerequisites
- Node.js 18+
- Airtable base configured (see schema above)
- Chatbase account with API key

### Setup

```bash
# Clone / navigate to repo
cd /path/to/ChatbaseAdmin

# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env.local
# Edit .env.local with your keys

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — redirects to `/admin`.

### Testing API routes locally

```bash
# Health (no auth)
curl http://localhost:3000/api/health

# Sync conversations (requires token)
curl -X POST http://localhost:3000/api/sync/conversations \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'

# Sync messages for a specific conversation
curl -X POST http://localhost:3000/api/sync/messages \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"abc123"}'

# Dry-run chatbot update
curl -X POST http://localhost:3000/api/sync/update-chatbot \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"chatbotId":"bot123","instructions":"You are...","dryRun":true}'
```

---

## Deployment to Vercel

1. Push to a GitHub repository (private).

2. Import into Vercel:
   - Go to vercel.com → New Project → Import repo
   - Framework preset: **Next.js** (auto-detected)
   - Root directory: leave empty (project root)

3. Set environment variables in Vercel dashboard:
   - `CHATBASE_API_KEY`
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID` → `appy5x5vC5HjN3Ukq`
   - `INTERNAL_ADMIN_TOKEN` → generate with `openssl rand -hex 32`

4. Recommended: enable **Vercel Password Protection** (Pro) or restrict access via Vercel's trusted IPs to prevent public access to `/admin/*`.

5. Configure Airtable automations to POST to:
   ```
   https://your-deployment.vercel.app/api/webhooks/airtable/review-created
   ```
   with header `Authorization: Bearer <INTERNAL_ADMIN_TOKEN>`.

---

## Project Structure

```
src/
  app/
    layout.tsx                     Root HTML shell
    page.tsx                       Redirect → /admin
    globals.css                    All styles (no UI library)
    admin/
      layout.tsx                   Sidebar nav wrapper
      page.tsx                     Dashboard (stats + recent jobs)
      RunSyncButton.tsx            Client component for sync trigger
      conversations/
        page.tsx                   Conversation list table
        [conversationId]/
          page.tsx                 Message thread view
          FeedbackButtons.tsx      Client component for feedback
      prompt-changes/
        page.tsx                   Prompt change request table
      sync-jobs/
        page.tsx                   Sync job log
    api/
      health/route.ts
      sync/
        conversations/route.ts
        messages/route.ts
        message-feedback/route.ts
        update-chatbot/route.ts
      webhooks/
        airtable/review-created/route.ts
  lib/
    auth.ts          requireAdminToken() helper
    chatbase.ts      Chatbase API client (typed)
    airtable.ts      Airtable API client (typed, upsert support)
    mappers.ts       Chatbase → Airtable field mappers + field interfaces
    constants.ts     TABLES map + other constants
    url.ts           URL builder helpers
```

---

*Internal use only. Do not expose this application on a public URL without authentication.*
