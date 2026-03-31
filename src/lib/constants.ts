// Airtable base and table IDs for ChatbaseAdmin
// Base: appy5x5vC5HjN3Ukq

export const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID ?? 'appy5x5vC5HjN3Ukq';

export const TABLES = {
  USERS: 'tbl7Z5w12sAh3lx2A',
  CHATBOTS: 'tblALOX2TYrzWPVKe',
  CONVERSATIONS: 'tblV1K2KQUrI8PAmt',
  MESSAGES: 'tblAMrcshFzNUYx5g',
  MESSAGE_REVIEWS: 'tblVYqPsI2vLZqwez',
  PROMPT_CHANGE_REQUESTS: 'tblalr4AqofO1cpZQ',
  CONTENT_CHANGE_REQUESTS: 'tblBLkBmSaAib0WLr',
  SYNC_JOBS: 'tbllNdfrQq45ZcHSF',
  CHATBASE_USERS: 'tblL7n2Kh6tK4mq6l',
} as const;

// Chatbase API base URL
export const CHATBASE_API_BASE = 'https://www.chatbase.co/api/v1';

// App version — update on releases
export const APP_VERSION = '0.1.0';
