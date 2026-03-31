'use client';

/**
 * /admin_embed — Softr-embeddable chatbot action panel
 *
 * The Softr embed script (softr-embed-code.txt) is responsible for waiting
 * until BOTH ?recordId= and ?userEmail= are fully resolved before creating
 * this iframe. This page therefore reads params synchronously on mount —
 * no polling needed here.
 *
 * iframe src pattern set by the Softr embed script:
 *   https://chatbase-admin.vercel.app/admin_embed?recordId=recXXX&userEmail=user@example.com
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
    <span style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-primary btn-sm" disabled={pending}
        onClick={() => { setMsg(''); start(async () => {
          const r = await pushPendingFeedback();
          console.log('[PushFeedback]', r);
          if (r.ok) {
            setMsg(r.sent === 0 ? 'No pending feedback.' : `Sent ${r.sent} item(s).`);
            setIsErr(false);
            onDone();
          } else {
            const detail = r.details.length > 0 ? ` — ${r.details[0]}` : '';
            setMsg(`${r.sent} sent, ${r.errors} error(s)${detail}`);
            setIsErr(true);
          }
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
    // Both params are guaranteed present by the Softr embed script before
    // this iframe is created — read them synchronously.
    const params = new URLSearchParams(window.location.search);
    const rid = params.get('recordId');
    const email = params.get('userEmail');

    if (email) setUserEmail(email);

    if (!rid) {
      setErrMsg('Missing ?recordId= — check the Softr embed script.');
      setPhase('error');
      return;
    }

    setRecordId(rid);
    loadData(rid);
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
