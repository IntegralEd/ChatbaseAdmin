'use server';

import { listRecords, getRecord } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import type { AirtableRecord } from '@/lib/airtable';
import type {
  ChatbotFields,
  MessageReviewFields,
  PromptChangeRequestFields,
} from '@/lib/mappers';

export interface ChatbotPanelData {
  chatbot: AirtableRecord<ChatbotFields> | null;
  reviews: AirtableRecord<MessageReviewFields>[];
  changes: AirtableRecord<PromptChangeRequestFields>[];
  error?: string;
}

/**
 * Loads all data needed for the embed panel in a single round-trip.
 * Called client-side once the recordId is resolved.
 */
export async function loadChatbotPanel(recordId: string): Promise<ChatbotPanelData> {
  try {
    const [chatbotResult, reviewsResult, changesResult] = await Promise.allSettled([
      getRecord<ChatbotFields>(TABLES.CHATBOTS, recordId),
      listRecords<MessageReviewFields>(TABLES.MESSAGE_REVIEWS, {
        filterByFormula: `AND({Send_To_Chatbase}=1, {Feedback_Sync_Status}!="sent")`,
        sort: [{ field: 'Feedback_Sync_Status', direction: 'asc' }],
      }),
      listRecords<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, {
        filterByFormula: `OR({Change_Status}="Requested",{Change_Status}="Approved")`,
        sort: [{ field: 'Change_Title', direction: 'asc' }],
      }),
    ]);

    return {
      chatbot: chatbotResult.status === 'fulfilled' ? chatbotResult.value : null,
      reviews: reviewsResult.status === 'fulfilled' ? reviewsResult.value : [],
      changes: changesResult.status === 'fulfilled' ? changesResult.value : [],
      error: chatbotResult.status === 'rejected'
        ? `Chatbot not found: ${String(chatbotResult.reason)}`
        : undefined,
    };
  } catch (err) {
    return {
      chatbot: null,
      reviews: [],
      changes: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

