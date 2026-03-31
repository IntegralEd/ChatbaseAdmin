/**
 * Mappers between Chatbase API types and Airtable field shapes.
 *
 * SCHEMA NOTES:
 *
 * Field name gotcha: `Chatbase__Idenitifer` — double underscore, misspelled
 * "Identifier". Use exactly as-is when reading/writing Chatbase_Chatbots.
 *
 * Schema mismatch (documented for future devs):
 *   - Prompt_Change_Requests.Source_Message_Links → links to Chatbase_Conversations
 *     (tblV1K2KQUrI8PAmt), NOT Chatbase_Messages. The field name is misleading.
 *   - Content_Change_Requests.Source_Message_Links → correctly links to
 *     Chatbase_Messages (tblAMrcshFzNUYx5g). Same field name, different target.
 */

import type { ChatbaseConversation, ChatbaseMessage } from './chatbase';

// ── Airtable field shapes ─────────────────────────────────────────────────────

export interface ChatbotFields {
  // Note: double underscore + misspelled — must match exactly
  Chatbase__Idenitifer: string;
  Name: string;
  Instructions: string;
  Source_Text: string;
  Last_Synced: string;
}

export interface ConversationFields {
  Conversation_ID: string;
  Chatbot: string[]; // multipleRecordLinks — array of Airtable record IDs
  User_Email: string;
  Started_At: string;
  Message_Count: number;
  Last_Synced: string;
}

export interface MessageFields {
  Message_ID: string;
  Conversation: string[]; // multipleRecordLinks
  Role: 'user' | 'assistant';
  Content: string;
  Feedback: 'positive' | 'negative' | null;
  Created_At: string;
  Last_Synced: string;
}

export interface MessageReviewFields {
  Message: string[]; // multipleRecordLinks → Chatbase_Messages
  Reviewer: string[]; // multipleRecordLinks → Users
  Rating: string;
  Notes: string;
  Reviewed_At: string;
  Status: string;
}

export interface PromptChangeRequestFields {
  Change_Title: string;
  Problem_Observed: string;
  Change_Type: string;
  Proposed_Prompt_Text: string;
  Proposed_Source_Change: string;
  Change_Status: string;
  // ⚠️ Schema mismatch: field name says "Message_Links" but links to Conversations
  Source_Message_Links: string[];
  Requested_By: string[];
  Pushed_Datetime: string;
  Chatbase_Update_Result: string;
}

export interface ContentChangeRequestFields {
  Title: string;
  Proposed_Change: string;
  Status: string;
  // Correctly links to Chatbase_Messages
  Source_Message_Links: string[];
  Approved_By: string[];
  Applied_At: string;
}

export interface SyncJobFields {
  Job_Type: string;
  Status: 'running' | 'success' | 'error';
  Started_At: string;
  Completed_At: string;
  Records_Processed: number;
  Error_Message: string;
  Triggered_By: string;
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function conversationToAirtableFields(
  conv: ChatbaseConversation,
  chatbotRecordId?: string,
): Partial<ConversationFields> {
  const fields: Partial<ConversationFields> = {
    Conversation_ID: conv.id,
    Started_At: conv.createdAt,
    Last_Synced: new Date().toISOString(),
  };

  if (conv.customerEmail) fields.User_Email = conv.customerEmail;
  if (conv.messageCount !== undefined) fields.Message_Count = conv.messageCount;
  if (chatbotRecordId) fields.Chatbot = [chatbotRecordId];

  return fields;
}

export function messageToAirtableFields(
  msg: ChatbaseMessage,
  conversationRecordId?: string,
): Partial<MessageFields> {
  const fields: Partial<MessageFields> = {
    Message_ID: msg.id,
    Role: msg.role,
    Content: msg.content,
    Created_At: msg.createdAt,
    Last_Synced: new Date().toISOString(),
  };

  // Airtable singleSelect does not accept null as a string — omit if null
  if (msg.feedback !== undefined && msg.feedback !== null) {
    fields.Feedback = msg.feedback;
  }

  if (conversationRecordId) fields.Conversation = [conversationRecordId];

  return fields;
}

export function syncJobStartFields(
  jobType: string,
  triggeredBy = 'api',
): Partial<SyncJobFields> {
  return {
    Job_Type: jobType,
    Status: 'running',
    Started_At: new Date().toISOString(),
    Triggered_By: triggeredBy,
    Records_Processed: 0,
  };
}

export function syncJobSuccessFields(recordsProcessed: number): Partial<SyncJobFields> {
  return {
    Status: 'success',
    Completed_At: new Date().toISOString(),
    Records_Processed: recordsProcessed,
  };
}

export function syncJobErrorFields(
  error: string,
  recordsProcessed = 0,
): Partial<SyncJobFields> {
  return {
    Status: 'error',
    Completed_At: new Date().toISOString(),
    Records_Processed: recordsProcessed,
    Error_Message: error,
  };
}
