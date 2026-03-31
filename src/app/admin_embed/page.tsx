'use client';

/**
 * /admin_embed — Softr-embeddable chatbot action panel
 *
 * Reads ?recordId= from the URL (set by Softr when building the iframe src).
 * Polls for up to 5 s in case Softr injects the param after initial load.
 * Also reads a hidden #softr-user-email element if present (Softr template var).
 *
 * Embed in Softr as a Custom Code / Embed block pointing to:
 *   https://chatbase-admin.vercel.app/admin_embed?recordId={RECORD_ID}
 *
 * Softr logged-in email capture (optional — add to the same Softr page):
 *   <span id="softr-user-email" style="display:none">{LOGGED_IN_USER:EMAIL}</span>
 */

import { useState, useEffect, useTransition } from 'react';
import { loadChatbotPanel, type ChatbotPanelData } from './data-actions';
import { pushPendingFeedback, pushPromptChange } from '@/app/admin/chatbot/actions';
import { syncAll } from '@/app/admin/actions';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | undefined) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// Reads recordId from the URL, waiting up to maxWait ms if not yet present.
function waitForRecordId(
  maxWait = 5000,
  interval = 100,
): Promise<string | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('recordId');
      if (id) return resolve(id);
      if (Date.now() - start >= maxWait) return resolve(null);
      setTimeout(check, interval);
    };
    check();
  });
}

// Reads Softr's injected user email from a hidden element, with same polling.
function waitForSoftrEmail(maxWait = 5000, interval = 100): Promise<string | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = document.getElementById('softr-user-email');
      const text = el?.textContent?.trim() ?? '';
      // Softr replaces its template vars; skip if still a placeholder
      if (text && !text.includes('{') && !text.includes('}')) return resolve(text);
      if (Date.now() - start >= maxWait) return resolve(null);
      setTimeout(check, interval);
    };
    check();
  });
}

// ── sub-components ────────────────────────────────────────────────────────────

function StatusMsg({ msg, isErr }: { msg: string; isErr: boolean }) {
  return (
    <span style={{ fontSize: '0.8rem', color: isErr ? 'var(--color-danger)' : 'var(--color-success)' }}>
      {msg}
    </span>
  );
}

function SyncBtn({ onDone, userEmail }: { onDone: () => void; userEmail?: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  return (
    <span style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center' }}>
      <button className="btn btn-primary btn-sm" disabled={pending}
        onClick={() => { setMsg(''); start(async () => {
          const r = await syncAll(false, userEmail);
          setMsg(r.ok ? `Synced ${r.conversations} convs, ${r.messages} msgs.` : r.error ?? 'Failed');
          setIsErr(!r.ok);
          if (r.ok) onDone();
        }); }}>
        {pending ? 'Syncing…' : 'Sync Now'}
      </button>
      {msg && <StatusMsg msg={msg} isErr={isErr} />}
    </span>
  );
}

function PushFeedbackBtn({ onDone }: { onDone: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  return (
    <span style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center' }}>
      <button className="btn btn-primary btn-sm" disabled={pending}
        onClick={() => { setMsg(''); start(async () => {
          const r = await pushPendingFeedback();
          setMsg(r.ok
            ? r.sent === 0 ? 'No pending feedback.' : `Sent ${r.sent} item(s).`
            : `${r.sent} sent, ${r.errors} error(s)`);
          setIsErr(!r.ok);
          if (r.ok) onDone();
        }); }}>
        {pending ? 'Sending…' : 'Push All Feedback'}
      </button>
      {msg && <StatusMsg msg={msg} isErr={isErr} />}
    </span>
  );
}

function PushPromptBtn({ changeId, chatbotRecordId, onDone }: {
  changeId: string; chatbotRecordId: string; onDone: () => void;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', alignItems: 'center' }}>
      <button className="btn btn-sm btn-primary" disabled={pending}
        onClick={() => { setMsg(''); start(async () => {
          const r = await pushPromptChange(changeId, chatbotRecordId);
          setMsg(r.ok ? 'Pushed ✓' : r.error ?? 'Failed');
          setIsErr(!r.ok);
          if (r.ok) onDone();
        }); }}>
        {pending ? 'Pushing…' : 'Push'}
      </button>
      {msg && <StatusMsg msg={msg} isErr={isErr} />}
    </span>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AdminEmbedPage() {
  const [phase, setPhase] = useState<'waiting' | 'loading' | 'ready' | 'error'>('waiting');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [data, setData] = useState<ChatbotPanelData | null>(null);
  const [errMsg, setErrMsg] = useState('');

  // Load (or reload) panel data once recordId is known
  async function loadData(rid: string) {
    setPhase('loading');
    const result = await loadChatbotPanel(rid);
    if (result.error || !result.chatbot) {
      setErrMsg(result.error ?? 'Chatbot not found');
      setPhase('error');
    } else {
      setData(result);
      setPhase('ready');
    }
  }

  useEffect(() => {
    // userEmail is passed directly in the URL by Softr (?userEmail=...) —
    // Softr replaces {LOGGED_IN_USER:EMAIL} before the script runs, so it
    // arrives as a resolved string in the iframe src, no polling needed.
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('userEmail');
    if (emailParam) setUserEmail(emailParam);

    waitForRecordId().then((rid) => {
      if (!rid) {
        setErrMsg('No ?recordId= found in URL after 5 s. Check the embed src.');
        setPhase('error');
        return;
      }
      setRecordId(rid);
      loadData(rid);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── states ──────────────────────────────────────────────────────────────────

  if (phase === 'waiting' || phase === 'loading') {
    return (
      <div style={shell}>
        <div style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
          {phase === 'waiting' ? 'Resolving record…' : 'Loading chatbot panel…'}
        </div>
      </div>
    );
  }

  if (phase === 'error' || !data) {
    return (
      <div style={shell}>
        <p style={{ color: 'var(--color-danger)' }}>{errMsg}</p>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
          Expected URL: <code>/admin_embed?recordId=recXXXXXXXXXXXXXX</code>
        </p>
      </div>
    );
  }

  const { chatbot, reviews, changes } = data;
  const reload = () => { if (recordId) loadData(recordId); };

  return (
    <div style={shell}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem' }}>
            {chatbot!.fields.Chatbot_Name ?? 'Chatbot'}
          </h1>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
            ID: {chatbot!.fields.Chatbase_Chatbot_ID ?? '—'}
            {userEmail && <> &nbsp;·&nbsp; {userEmail}</>}
          </p>
        </div>
        <SyncBtn onDone={reload} userEmail={userEmail ?? undefined} />
      </div>

      {/* ── Feedback Queue ──────────────────────────────────────────────────── */}
      <section style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
          <h2 style={{ margin: 0, fontSize: '1rem' }}>
            Message Feedback Queue
            <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--color-muted)', marginLeft: '0.4rem' }}>
              ({reviews.length} pending)
            </span>
          </h2>
          <PushFeedbackBtn onDone={reload} />
        </div>

        {reviews.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>No pending feedback reviews.</p>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Rating</th>
                  <th>Issue Type</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <tr key={r.id}>
                    <td style={{
                      fontWeight: 600,
                      color: r.fields.Internal_Rating?.toLowerCase() === 'positive'
                        ? 'var(--color-success)'
                        : r.fields.Internal_Rating?.toLowerCase() === 'negative'
                        ? 'var(--color-danger)' : undefined,
                    }}>
                      {r.fields.Internal_Rating ?? '—'}
                    </td>
                    <td>{r.fields.Issue_Type ?? '—'}</td>
                    <td style={{ color: r.fields.Feedback_Sync_Status === 'error' ? 'var(--color-danger)' : undefined }}>
                      {r.fields.Feedback_Sync_Status || 'pending'}
                    </td>
                    <td className="truncate" title={r.fields.Internal_Notes ?? ''}>
                      {r.fields.Internal_Notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Prompt Change Queue ─────────────────────────────────────────────── */}
      <section>
        <h2 style={{ margin: '0 0 0.6rem', fontSize: '1rem' }}>
          Prompt Change Queue
          <span style={{ fontWeight: 400, fontSize: '0.8rem', color: 'var(--color-muted)', marginLeft: '0.4rem' }}>
            ({changes.length} queued)
          </span>
        </h2>

        {changes.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>No queued prompt changes.</p>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Pushed</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.fields.Change_Title ?? '—'}</td>
                    <td>{c.fields.Change_Type ?? '—'}</td>
                    <td>{c.fields.Change_Status ?? '—'}</td>
                    <td>{fmt(c.fields.Pushed_Datetime)}</td>
                    <td>
                      <PushPromptBtn
                        changeId={c.id}
                        chatbotRecordId={recordId!}
                        onDone={reload}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

const shell: React.CSSProperties = {
  padding: '1.25rem 1.5rem',
  maxWidth: '900px',
  margin: '0 auto',
  fontFamily: 'inherit',
};
