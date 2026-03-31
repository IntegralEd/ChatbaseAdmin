/**
 * /admin — Dashboard
 *
 * Server component: fetches counts and last 5 sync jobs from Airtable.
 * "Run Sync" button is a client island below.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { listRecords } from '@/lib/airtable';
import { TABLES } from '@/lib/constants';
import type { SyncJobFields, PromptChangeRequestFields } from '@/lib/mappers';
import RunSyncButton from './RunSyncButton';

export const metadata: Metadata = { title: 'Dashboard' };

// Revalidate every 60 seconds so dashboard stays reasonably fresh
export const revalidate = 60;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    success: 'badge-success',
    error: 'badge-error',
    running: 'badge-running',
  };
  return `badge ${map[status] ?? 'badge-default'}`;
}

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

export default async function DashboardPage() {
  // Fetch in parallel
  const [conversations, messages, promptChanges, syncJobs] = await Promise.allSettled([
    listRecords(TABLES.CONVERSATIONS, { maxRecords: 1000 }),
    listRecords(TABLES.MESSAGES, { maxRecords: 1000 }),
    listRecords<PromptChangeRequestFields>(TABLES.PROMPT_CHANGE_REQUESTS, {
      filterByFormula: 'OR({Status}="open",{Status}="pending")',
    }),
    listRecords<SyncJobFields>(TABLES.SYNC_JOBS, {
      sort: [{ field: 'Started_At', direction: 'desc' }],
      maxRecords: 5,
    }),
  ]);

  const convCount = conversations.status === 'fulfilled' ? conversations.value.length : '?';
  const msgCount = messages.status === 'fulfilled' ? messages.value.length : '?';
  const openChanges = promptChanges.status === 'fulfilled' ? promptChanges.value.length : '?';
  const recentJobs = syncJobs.status === 'fulfilled' ? syncJobs.value : [];

  return (
    <div>
      <div className="flex-row mb-2">
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <RunSyncButton />
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Conversations</div>
          <div className="value">{convCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Messages</div>
          <div className="value">{msgCount}</div>
        </div>
        <div className="stat-card">
          <div className="label">Open Prompt Changes</div>
          <div className="value">{openChanges}</div>
        </div>
      </div>

      <h2>Recent Sync Jobs</h2>
      {recentJobs.length === 0 ? (
        <p className="text-muted">No sync jobs found.</p>
      ) : (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Started</th>
                <th>Completed</th>
                <th>Records</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {recentJobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.fields.Job_Type ?? '—'}</td>
                  <td>
                    <span className={statusBadge(job.fields.Status ?? '')}>
                      {job.fields.Status ?? '—'}
                    </span>
                  </td>
                  <td>{fmt(job.fields.Started_At)}</td>
                  <td>{fmt(job.fields.Completed_At)}</td>
                  <td>{job.fields.Records_Processed ?? 0}</td>
                  <td>
                    {job.fields.Error_Message ? (
                      <span className="truncate" title={job.fields.Error_Message} style={{ color: 'var(--color-danger)' }}>
                        {job.fields.Error_Message}
                      </span>
                    ) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2">
        <Link href="/admin/sync-jobs">View all sync jobs</Link>
        {' | '}
        <Link href="/admin/conversations">View conversations</Link>
        {' | '}
        <Link href="/admin/prompt-changes">View prompt changes</Link>
      </div>
    </div>
  );
}
