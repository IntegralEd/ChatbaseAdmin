# ChatbaseAdmin

Internal ops application for managing Chatbase chatbot training, reviewing conversations, and pushing corrective feedback and prompt changes.

**This is NOT a public-facing chatbot.** Authorised team members only.

Deployed at: `https://chatbase-admin.vercel.app`

---

## What it does

| Capability | How |
|---|---|
| Sync conversations + messages from Chatbase | `syncAll` server action — incremental by default |
| Sync chatbot profile (instructions, model, status, last trained) | Runs automatically on every sync |
| Review message quality and flag corrections | Message_Reviews table + embed panel |
| Push corrective feedback as Chatbase training source | Batched source text, one document per push |
| Manage and push prompt changes | Prompt_Change_Requests table + embed panel |
| Softr embed panel for non-technical admins | `/admin_embed` iframe embedded in Softr |

---

## Workflow

### Message Feedback
1. A conversation message is flagged (`Needs_Review=true`) or a reviewer creates a `Message_Review` record in Airtable
2. In the embed panel, reviewer fills in `Response_Snippet_to_Improve`, `Suggested_Response`, and `Internal_Notes`
3. Airtable formula field `Message_Feedback_Concat` auto-concatenates into training text:
   ```
   {Internal_Notes}

   When Agent said: {Response_Snippet_to_Improve}
   Instead it should have said the following: {Suggested_Response}
   ```
4. Reviewer clicks **Approve** in the embed panel → `Change_Status = Approved`
5. Reviewer checks the **Send** checkbox on the row
6. Reviewer clicks **Send Approved Items to Retrain** → batches all checked+approved reviews into a single dated source document pushed to Chatbase via `POST /update-chatbot-data`
7. Each push creates a uniquely named source document: `Corrective Feedback — YYYY-MM-DD — user@email.com` — batches accumulate, nothing is overwritten
8. On success: `Change_Status = Sync Complete`, record drops off the queue

### Prompt Changes
1. A `Prompt_Change_Request` record is created in Airtable with `Change_Status = Requested`
2. In the embed panel, reviewer clicks **Approve** → `Change_Status = Approved`
3. Reviewer checks the **Queue** checkbox on the row (only one may be queued at a time)
4. Reviewer clicks **Push** → pushes `Proposed_Prompt_Text` via `POST /update-chatbot-settings` and/or `Proposed_Source_Change` via `POST /update-chatbot-data`
5. On success: `Change_Status = Sync Complete`, `Pushed_Datetime` set, record drops off the queue

### Change_Status lifecycle (both tables)
```
Requested → Approved → Sync Complete
         ↘           ↘
          Rejected    Rejected
```
`Pushed` is deprecated — `Sync Complete` is now the terminal success state.

---

## Softr Embed Panel (`/admin_embed`)

A lightweight iframe panel embedded in Softr pages. The Softr custom code block in `reference/softr-embed-code.txt` handles:
- Reading `?recordId=` from the page URL (the Airtable chatbot record ID)
- Polling a hidden `{LOGGED_IN_USER:EMAIL}` span until Softr resolves it
- Injecting the iframe once both values are confirmed

**Softr page URL pattern:**
```
https://yourapp.softr.app/chatbot-admin?recordId=recXXXXXXXXXXXXXX
```

The embed panel shows:
- Chatbot name, Chatbase ID, logged-in user, last trained timestamp
- **Message Feedback Queue** — Approve / Reject / Send checkbox per row
- **Prompt Change Queue** — Approve / Reject / Queue checkbox / Push per row
- **Sync Now** button — syncs conversations, messages, and chatbot profile

---

## Architecture

```
Softr page (iframe)             Internal browser (/admin/*)
        |                               |
        | HTTPS                         | HTTPS
        v                               v
  Next.js 14 App Router — Vercel (chatbase-admin.vercel.app)
  ┌────────────────────────────────────────────────────────┐
  │  /admin_embed        Client page — Softr iframe target  │
  │  /admin/*            Server components (read from AT)   │
  │  /api/sync/*         POST routes (legacy, keep for now) │
  │  /api/health         GET (no auth)                      │
  │                                                         │
  │  Server Actions (app/admin/actions.ts)                  │
  │    syncAll()         Conversations + profile sync       │
  │  Server Actions (app/admin/chatbot/actions.ts)          │
  │    pushFeedbackAsSource()   Batch feedback → Chatbase   │
  │    pushPromptChange()       Push instructions/source    │
  │    approveMessageReview()   Set Change_Status=Approved  │
  │    approvePromptChange()    Set Change_Status=Approved  │
  │    rejectMessageReview()    Set Change_Status=Rejected  │
  │    rejectPromptChange()     Set Change_Status=Rejected  │
  │    toggleSendToChatbase()   Toggle send checkbox        │
  │    toggleQueueForPush()     Toggle queue checkbox       │
  └──────────┬─────────────────────────┬───────────────────┘
             │                         │
      Bearer token               Bearer token
             │                         │
             v                         v
     ┌───────────────┐       ┌──────────────────┐
     │  Airtable API │       │  Chatbase API v1  │
     │  base: appy…  │       │  chatbase.co      │
     └───────────────┘       └──────────────────┘
```

---

## Chatbase API endpoints in use

| Method | Endpoint | Used for |
|---|---|---|
| GET | `/api/v1/get-chatbots` | Fetch all chatbot profiles (sync) |
| GET | `/api/v1/get-conversations` | Fetch paginated conversations |
| POST | `/api/v1/update-chatbot-data` | Push source text (feedback batches, source changes) |
| POST | `/api/v1/update-chatbot-settings` | Push instructions update |

> **Note:** These are v1 endpoints. The v2 `/agents/` endpoints do not work for v1 chatbots.
> There is no GET `/get-chatbot` (singular) — use `/get-chatbots` and filter by ID.

---

## Sync_Jobs audit trail

Every push operation creates a `Sync_Jobs` record:

| `Job_Type` | Trigger | Linked records |
|---|---|---|
| `conversation_sync` | Sync Now button | `Chatbot_Link`, `Triggered_By` |
| `feedback_push` | Send Approved Items to Retrain | `Feedback_Reviews_Link`, `Feedback_Text_Transmitted` |
| `prompt_push` | Push prompt change | `Prompt_Changes_Link`, `Prompt_Text_Transmitted` |

---

## Airtable Schema

### Key field notes

- `Chatbase_Chatbot_ID` — primary chatbot identifier. Previously `Chatbase__Idenitifer` (misspelled, double underscore) — use the new name everywhere.
- `Change_Status` — singleSelect on both `Message_Reviews` and `Prompt_Change_Requests`. Options: `Requested`, `Approved`, `Sync Complete`, `Rejected`. (`Pushed` is deprecated.)
- `Message_Feedback_Concat` — formula field on `Message_Reviews`. Must include `Internal_Notes`, `Response_Snippet_to_Improve`, and `Suggested_Response`.
- `Queue_For_Push` — checkbox on `Prompt_Change_Requests`. Exactly one must be checked to enable Push.
- `Send_To_Chatbase` — checkbox on `Message_Reviews`. Only enabled in the UI once `Change_Status=Approved`.
- `Last_Trained` — dateTime on `Chatbase_Chatbots`. Populated from `last_trained_at` on every profile sync.
- `Prompted_Change_Requests.Source_Message_Links` — links to `Chatbase_Messages` (fixed 2026-03-30; previously linked to Conversations by mistake).

### Table IDs

| Constant | Table ID | Table Name |
|---|---|---|
| `TABLES.USERS` | tbl7Z5w12sAh3lx2A | Users |
| `TABLES.CHATBOTS` | tblALOX2TYrzWPVKe | Chatbase_Chatbots |
| `TABLES.CONVERSATIONS` | tblV1K2KQUrI8PAmt | Chatbase_Conversations |
| `TABLES.MESSAGES` | tblAMrcshFzNUYx5g | Chatbase_Messages |
| `TABLES.MESSAGE_REVIEWS` | tblVYqPsI2vLZqwez | Message_Reviews |
| `TABLES.PROMPT_CHANGE_REQUESTS` | tblalr4AqofO1cpZQ | Prompt_Change_Requests |
| `TABLES.CONTENT_CHANGE_REQUESTS` | tblBLkBmSaAib0WLr | Content_Change_Requests |
| `TABLES.SYNC_JOBS` | tbllNdfrQq45ZcHSF | Sync_Jobs |
| `TABLES.CHATBASE_USERS` | tblL7n2Kh6tK4mq6l | Chatbase_Users_Table |

Schema registry: `reference/schema-registry.csv` — export from Airtable and replace when fields change.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CHATBASE_API_KEY` | Yes | Chatbase API key from chatbase.co dashboard |
| `AIRTABLE_API_KEY` | Yes | Airtable personal access token |
| `AIRTABLE_BASE_ID` | Yes | Airtable base ID — `appy5x5vC5HjN3Ukq` |
| `INTERNAL_ADMIN_TOKEN` | Yes | Shared secret for legacy API routes. Generate: `openssl rand -hex 32` |

---

## Project Structure

```
src/
  app/
    layout.tsx
    page.tsx                          Redirect → /admin
    globals.css
    admin/
      layout.tsx                      Sidebar nav
      page.tsx                        Dashboard
      actions.ts                      syncAll() server action
      chatbot/
        page.tsx                      Per-chatbot admin page
        actions.ts                    All push/approve/reject server actions
        ChatbotActions.tsx
      conversations/
        page.tsx
        [conversationId]/page.tsx
      sync-jobs/page.tsx
    admin_embed/
      page.tsx                        Softr iframe panel (client component)
      data-actions.ts                 loadChatbotPanel() server action
    api/
      health/route.ts
      sync/
        conversations/route.ts
        message-feedback/route.ts     Updates Airtable only (no Chatbase feedback API on v1)
        update-chatbot/route.ts
  lib/
    airtable.ts                       Typed Airtable client (listRecords, upsertRecords, etc.)
    chatbase.ts                       Typed Chatbase API client
    mappers.ts                        Field interfaces + Chatbase→Airtable mappers
    constants.ts                      TABLES map
    url.ts                            URL builder helpers
reference/
  schema-registry.csv                 Latest Airtable schema export
  softr-embed-code.txt                Softr custom code block for iframe embed
```

---

## Local Development

```bash
npm install
cp .env.example .env.local   # fill in keys
npm run dev                  # http://localhost:3000 → /admin
```

### Useful curl tests

```bash
# Verify Chatbase API key + list chatbots
curl "https://www.chatbase.co/api/v1/get-chatbots" \
  -H "Authorization: Bearer $CHATBASE_API_KEY"

# Test feedback push (requires real chatbotId and meaningful sourceText)
curl -X POST "https://www.chatbase.co/api/v1/update-chatbot-data" \
  -H "Authorization: Bearer $CHATBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"chatbotId":"...","chatbotName":"Test Batch","sourceText":"...at least 100 chars of content..."}'

# Test settings push
curl -X POST "https://www.chatbase.co/api/v1/update-chatbot-settings" \
  -H "Authorization: Bearer $CHATBASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"chatbotId":"...","instructions":"You are..."}'
```

---

## Deployment

Push to `main` → Vercel auto-deploys. Project linked via `.vercel/project.json` to `chatbase-admin` on the IntegralEd team.

Set these in the Vercel dashboard:
- `CHATBASE_API_KEY`
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `INTERNAL_ADMIN_TOKEN`

---

*Internal use only. Do not expose without authentication.*
