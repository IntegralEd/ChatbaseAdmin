/**
 * Mappers between Chatbase API types and Airtable field shapes.
 *
 * Field names are taken verbatim from schema-registry.csv (2026-03-31 19:13).
 *
 * NOTE: Chatbase_Chatbot_ID replaced the old Chatbase__Idenitifer field
 * (double underscore, misspelled). Use Chatbase_Chatbot_ID everywhere.
 *
 * Prompt_Change_Requests.Source_Message_Links now correctly links to
 * Chatbase_Messages (tblAMrcshFzNUYx5g). The previous schema mismatch
 * (it used to link to Conversations) has been fixed in the schema.
 */

import type { ChatbaseConversation, ChatbaseEmbeddedMessage, ChatbaseMessage } from './chatbase';

// ── Chatbase_Chatbots ─────────────────────────────────────────────────────────

export interface ChatbotFields {
  Chatbase_Chatbot_ID: string;
  Chatbot_Name: string;
  'Chatbots instructions': string;
  'Chatbots model': string;
  'Chatbots status': string;
  'Chatbots visibility': string;
  'Chatbots created at': string;
  'Chatbots last message at': string;
  'Chatbots last trained at': string;
  'Chatbots num of characters': number;
  'Chatbots temp': number;
  'Chatbots initial messages': string;
  'Chatbots styles theme': string;
  'Chatbots styles button color': string;
  'Chatbots styles align chat button': string;
  'Chatbots only allow on added domains': boolean;
}

// ── Chatbase_Conversations ────────────────────────────────────────────────────

export interface ConversationFields {
  Conversation_ID: string;
  Chatbot_Link: string[];       // multipleRecordLinks → Chatbase_Chatbots
  User_ID: string;              // user identifier from Chatbase (email or ID)
  Started_At: string;
  Last_Message_At: string;
  Message_Count: number;
  Has_Negative_Feedback: boolean;
  Title: string;
  Primary_Topic: string;
  Topics_Raw: string;
  External_Conversation_ID: string;
}

// ── Chatbase_Messages ─────────────────────────────────────────────────────────

export interface MessageFields {
  Message_ID: string;
  Conversation_Link: string[];  // multipleRecordLinks → Chatbase_Conversations
  Role: 'user' | 'assistant';
  Message_Content: string;      // was Content
  Feedback_Chatbase: string;    // singleLineText; was Feedback (singleSelect)
  Created_At: string;
  Message_Sequence: number;
  Contains_URL: boolean;
  Visible_URL: string;
  Needs_Review: boolean;
}

// ── Message_Reviews ───────────────────────────────────────────────────────────

export interface MessageReviewFields {
  Message_Link: string[];       // multipleRecordLinks → Chatbase_Messages
  Reviewer: string[];           // multipleRecordLinks → Users
  Internal_Rating: string;
  Send_To_Chatbase: boolean;
  Change_Status: string;        // singleSelect: Requested | Approved | Pushed | Sync Complete
  Feedback_Sync_At: string;
  Issue_Type: string;
  Internal_Notes: string;
  Response_Snippet_to_Improve: string;  // lookup: Message_Content from linked message
  Suggested_Response: string;
  Message_Feedback_Concat: string;      // formula: "When Agent said: ... It should have said: ..."
  Suggested_URL: string;
  Needs_Prompt_Fix: boolean;
  Needs_Content_Fix: boolean;
  Sync_Jobs: string[];          // multipleRecordLinks → Sync_Jobs
}

// ── Prompt_Change_Requests ────────────────────────────────────────────────────

export interface PromptChangeRequestFields {
  Change_Title: string;
  Problem_Observed: string;
  Change_Type: string;
  Proposed_Prompt_Text: string;
  Proposed_Source_Change: string;
  Change_Status: string;
  Queue_For_Push: boolean;      // checkbox — exactly one should be checked before pushing
  // Source_Message_Links correctly links to Chatbase_Messages (schema fixed 2026-03-30)
  Source_Message_Links: string[];
  Requested_By: string[];
  Pushed_Datetime: string;
  Chatbase_Update_Result: string;
  Sync_Jobs: string[];          // multipleRecordLinks → Sync_Jobs
}

// ── Sync_Jobs ─────────────────────────────────────────────────────────────────

export interface SyncJobFields {
  Started_At: string;
  Completed_At: string;
  Cursor_Used: string;
  Records_Imported: string;           // singleLineText
  Records_Updated: string;            // singleLineText
  Error_Log: string;
  Job_Type: string;                   // singleSelect: conversation_sync | feedback_push | prompt_push
  Chatbot_Link: string[];             // multipleRecordLinks → Chatbase_Chatbots
  Triggered_By: string[];             // multipleRecordLinks → Users
  Triggered_By_Txt: string;           // singleLineText fallback
  // Feedback push fields
  Feedback_Reviews_Link: string[];    // multipleRecordLinks → Message_Reviews
  Feedback_Text_Transmitted: string;  // multilineText — full source text sent to Chatbase
  Feedback_Reviews_Count: string;     // singleLineText
  // Prompt push fields
  Prompt_Changes_Link: string[];      // multipleRecordLinks → Prompt_Change_Requests
  Prompt_Text_Transmitted: string;    // multilineText — full text sent to Chatbase
  Prompt_Changes_Count: string;       // singleLineText
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function conversationToAirtableFields(
  conv: ChatbaseConversation,
  chatbotRecordId?: string,
): Partial<ConversationFields> {
  const fields: Partial<ConversationFields> = {
    Conversation_ID: conv.id,
    Started_At: conv.created_at,
    Last_Message_At: conv.last_message_at,
    Message_Count: conv.messages?.length ?? 0,
  };

  if (chatbotRecordId) fields.Chatbot_Link = [chatbotRecordId];

  return fields;
}

export function embeddedMessageToAirtableFields(
  msg: ChatbaseEmbeddedMessage,
  conversationId: string,
  conversationRecordId?: string,
): Partial<MessageFields> | null {
  // Skip messages without an id — can't upsert without a stable key
  if (!msg.id) return null;

  const fields: Partial<MessageFields> = {
    Message_ID: msg.id,
    Role: msg.role,
    Message_Content: msg.content,
    Created_At: msg.createdAt ?? new Date().toISOString(),
  };

  if (conversationRecordId) fields.Conversation_Link = [conversationRecordId];

  return fields;
}

// Keep for feedback route which still references ChatbaseMessage
export function messageToAirtableFields(
  msg: ChatbaseMessage,
  conversationRecordId?: string,
): Partial<MessageFields> {
  const fields: Partial<MessageFields> = {
    Message_ID: msg.id,
    Role: msg.role,
    Message_Content: msg.content,
    Created_At: msg.createdAt ?? new Date().toISOString(),
  };

  if (msg.feedback) fields.Feedback_Chatbase = msg.feedback;
  if (conversationRecordId) fields.Conversation_Link = [conversationRecordId];

  return fields;
}

export function syncJobStartFields(
  chatbotRecordId?: string,
  userRecordId?: string,
  userEmail?: string,
): Partial<SyncJobFields> {
  const fields: Partial<SyncJobFields> = {
    Started_At: new Date().toISOString(),
    Records_Imported: '0',
    Records_Updated: '0',
  };
  if (chatbotRecordId) fields.Chatbot_Link = [chatbotRecordId];
  if (userRecordId) fields.Triggered_By = [userRecordId];
  if (userEmail) fields.Triggered_By_Txt = userEmail;
  return fields;
}

export function syncJobSuccessFields(imported: number, updated = 0): Partial<SyncJobFields> {
  return {
    Completed_At: new Date().toISOString(),
    Records_Imported: String(imported),
    Records_Updated: String(updated),
  };
}

export function syncJobErrorFields(error: string): Partial<SyncJobFields> {
  return {
    Completed_At: new Date().toISOString(),
    Error_Log: error,
  };
}
