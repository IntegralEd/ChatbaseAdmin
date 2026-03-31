/**
 * Typed Airtable API client.
 *
 * Covers the operations needed by ChatbaseAdmin:
 *   - list records (with optional filterByFormula)
 *   - get single record
 *   - create record
 *   - update record (PATCH)
 *   - upsert records (POST with performUpsert)
 *
 * All functions throw an AirtableError on non-2xx responses.
 */

import { airtableTableUrl, airtableListUrl, airtableUpsertUrl } from './url';

// ── Generic Airtable record shape ─────────────────────────────────────────────

export interface AirtableRecord<T extends object> {
  id: string;
  createdTime: string;
  fields: T;
}

export interface AirtableListResponse<T extends object> {
  records: AirtableRecord<T>[];
  offset?: string;
}

// ── Error ─────────────────────────────────────────────────────────────────────

export class AirtableError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'AirtableError';
  }
}

// ── Internal fetch helper ─────────────────────────────────────────────────────

async function airtableFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  if (!apiKey) throw new AirtableError('AIRTABLE_API_KEY not configured', 500, '');

  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new AirtableError(
      `Airtable API error ${res.status} at ${url}: ${text}`,
      res.status,
      text,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AirtableError('Failed to parse Airtable response as JSON', 500, text);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List records from a table.
 * Paginates automatically using `offset` until all records are fetched.
 */
export async function listRecords<T extends object>(
  tableId: string,
  options: {
    filterByFormula?: string;
    fields?: string[];
    sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
    maxRecords?: number;
  } = {},
): Promise<AirtableRecord<T>[]> {
  const all: AirtableRecord<T>[] = [];
  let offset: string | undefined;

  do {
    const params: Record<string, string> = {};
    if (options.filterByFormula) params['filterByFormula'] = options.filterByFormula;
    if (options.maxRecords) params['maxRecords'] = String(options.maxRecords);
    if (offset) params['offset'] = offset;
    if (options.fields) {
      options.fields.forEach((f, i) => {
        params[`fields[${i}]`] = f;
      });
    }
    if (options.sort) {
      options.sort.forEach((s, i) => {
        params[`sort[${i}][field]`] = s.field;
        if (s.direction) params[`sort[${i}][direction]`] = s.direction;
      });
    }

    const url = airtableListUrl(tableId, params);
    const page = await airtableFetch<AirtableListResponse<T>>(url);
    all.push(...page.records);
    offset = page.offset;
  } while (offset);

  return all;
}

/**
 * Get a single record by its Airtable record ID.
 */
export async function getRecord<T extends object>(
  tableId: string,
  recordId: string,
): Promise<AirtableRecord<T>> {
  const url = airtableTableUrl(tableId, recordId);
  return airtableFetch<AirtableRecord<T>>(url);
}

/**
 * Create a new record.
 */
export async function createRecord<T extends object>(
  tableId: string,
  fields: Partial<T>,
): Promise<AirtableRecord<T>> {
  const url = airtableTableUrl(tableId);
  return airtableFetch<AirtableRecord<T>>(url, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

/**
 * Update (PATCH) an existing record by Airtable record ID.
 * Only fields provided are updated; others are left unchanged.
 */
export async function updateRecord<T extends object>(
  tableId: string,
  recordId: string,
  fields: Partial<T>,
): Promise<AirtableRecord<T>> {
  const url = airtableTableUrl(tableId, recordId);
  return airtableFetch<AirtableRecord<T>>(url, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
}

// ── Upsert ────────────────────────────────────────────────────────────────────

export interface UpsertPayload<T extends object> {
  records: Array<{ fields: Partial<T> }>;
  performUpsert: {
    fieldsToMergeOn: string[];
  };
}

export interface AirtableUpsertResponse<T extends object> {
  createdRecords: string[];
  updatedRecords: string[];
  records: AirtableRecord<T>[];
}

/**
 * Upsert up to 10 records at once.
 * Airtable's performUpsert uses the provided fields as the match key.
 *
 * NOTE: Airtable upsert endpoint accepts max 10 records per request.
 * Use upsertRecords (plural) for larger batches.
 */
export async function upsertBatch<T extends object>(
  tableId: string,
  records: Array<{ fields: Partial<T> }>,
  fieldsToMergeOn: string[],
): Promise<AirtableUpsertResponse<T>> {
  const url = airtableUpsertUrl(tableId);
  const payload: UpsertPayload<T> = {
    records,
    performUpsert: { fieldsToMergeOn },
  };
  return airtableFetch<AirtableUpsertResponse<T>>(url, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/**
 * Upsert an arbitrary number of records, chunking into batches of 10.
 * Returns aggregated counts and all records (including Airtable record IDs).
 */
export async function upsertRecords<T extends object>(
  tableId: string,
  records: Array<{ fields: Partial<T> }>,
  fieldsToMergeOn: string[],
): Promise<{ created: number; updated: number; records: AirtableRecord<T>[] }> {
  const BATCH_SIZE = 10;
  let created = 0;
  let updated = 0;
  const allRecords: AirtableRecord<T>[] = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const chunk = records.slice(i, i + BATCH_SIZE);
    const result = await upsertBatch<T>(tableId, chunk, fieldsToMergeOn);
    created += result.createdRecords.length;
    updated += result.updatedRecords.length;
    allRecords.push(...result.records);
  }

  return { created, updated, records: allRecords };
}
