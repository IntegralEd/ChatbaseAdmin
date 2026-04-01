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
import { pushFeedbackAsSource, pushPromptChange, toggleSendToChatbase, toggleQueueForPush } from '@/app/admin/chatbot/actions';
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

function PushFeedbackBtn({
  chatbotRecordId, userEmail, onDone,
}: { chatbotRecordId: string; userEmail?: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [isErr, setIsErr] = useState(false);
  return (
    <span style={{ display: 'inline-flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <button className="btn btn-primary btn-sm" disabled={pending}
        onClick={() => { setMsg(''); start(async () => {
          const r = await pushFeedbackAsSource(chatbotRecordId, userEmail);
          console.log('[PushFeedback]', r);
          if (r.ok) {
            setMsg(r.sent === 0 ? r.details[0] ?? 'Nothing to send.' : `Sent ${r.sent} review(s) as source.`);
            setIsErr(false);
            if (r.sent > 0) onDone();
          } else {
            setMsg(`Error — ${r.details.join(' | ')}`);
            setIsErr(true);
          }
        }); }}>
        {pending ? 'Sending…' : 'Send Feedback as Source'}
      </button>
      {msg && <StatusMsg msg={msg} isErr={isErr} />}
    </span>
  );
}

function SendToChatbaseToggle({ reviewId, checked, onToggle }: {
  reviewId: string; checked: boolean; onToggle: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      style={{ cursor: pending ? 'wait' : 'pointer' }}
      onChange={(e) => { start(async () => {
        await toggleSendToChatbase(reviewId, e.target.checked);
        onToggle();
      }); }}
    />
  );
}

function FeedbackRow({ review: r, onToggle }: {
  review: import('@/lib/airtable').AirtableRecord<import('@/lib/mappers').MessageReviewFields>;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const concat = r.fields.Message_Feedback_Concat;
  const snippet = r.fields.Response_Snippet_to_Improve;
  const suggested = r.fields.Suggested_Response;
  return (
    <>
      <tr>
        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '0.6rem' }}>
          <SendToChatbaseToggle
            reviewId={r.id}
            checked={!!r.fields.Send_To_Chatbase}
            onToggle={onToggle}
          />
        </td>
        <td style={{
          fontWeight: 600,
          verticalAlign: 'top',
          whiteSpace: 'nowrap',
          color: r.fields.Internal_Rating?.toLowerCase() === 'positive'
            ? 'var(--color-success)'
            : r.fields.Internal_Rating?.toLowerCase() === 'negative'
            ? 'var(--color-danger)' : undefined,
        }}>
          {r.fields.Internal_Rating ?? '—'}
        </td>
        <td style={{ verticalAlign: 'top' }}>
          {concat ? (
            <div>
              <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{concat}</div>
              <button
                onClick={() => setExpanded((v) => !v)}
                style={{ marginTop: '0.3rem', fontSize: '0.7rem', color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {expanded ? '▲ hide detail' : '▼ show original / suggested'}
              </button>
            </div>
          ) : (
            <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
              No Message_Feedback_Concat — add formula field in Airtable
            </span>
          )}
        </td>
        <td style={{ color: r.fields.Feedback_Sync_Status === 'error' ? 'var(--color-danger)' : undefined, verticalAlign: 'top', whiteSpace: 'nowrap' }}>
          {r.fields.Feedback_Sync_Status || 'pending'}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} style={{ background: 'var(--color-surface, #f9fafb)', padding: '0.75rem 1rem' }}>
            {snippet && (
              <div style={{ marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.2rem' }}>
                  ORIGINAL
                </div>
                <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{snippet}</div>
              </div>
            )}
            {suggested && (
              <div>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-muted)', marginBottom: '0.2rem' }}>
                  SUGGESTED
                </div>
                <div style={{ fontSize: '0.8rem', whiteSpace: 'pre-wrap' }}>{suggested}</div>
              </div>
            )}
            {!snippet && !suggested && (
              <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                Response_Snippet_to_Improve and Suggested_Response not filled.
              </span>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function QueueForPushToggle({ changeId, checked, onToggle }: {
  changeId: string; checked: boolean; onToggle: () => void;
}) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={pending}
      style={{ cursor: pending ? 'wait' : 'pointer' }}
      onChange={(e) => { start(async () => {
        await toggleQueueForPush(changeId, e.target.checked);
        onToggle();
      }); }}
    />
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
          <PushFeedbackBtn chatbotRecordId={recordId!} userEmail={userEmail ?? undefined} onDone={reload} />
        </div>

        {reviews.length === 0 ? (
          <p className="text-muted" style={{ fontSize: '0.875rem' }}>No pending feedback reviews.</p>
        ) : (
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th title="Include in next batch send">Send</th>
                  <th>Rating</th>
                  <th>Feedback</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reviews.map((r) => (
                  <FeedbackRow key={r.id} review={r} onToggle={reload} />
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
        ) : (() => {
          const queued = changes.filter((c) => !!c.fields.Queue_For_Push);
          const canPush = queued.length === 1;
          const tooMany = queued.length > 1;
          return (
            <>
              {tooMany && (
                <div style={{
                  marginBottom: '0.75rem',
                  padding: '0.6rem 0.85rem',
                  background: 'var(--color-warning-bg, #fffbeb)',
                  border: '1px solid var(--color-warning, #f59e0b)',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: 'var(--color-warning-text, #92400e)',
                }}>
                  {queued.length} changes are checked — uncheck all but one before pushing.
                  Each push replaces the full system prompt.
                </div>
              )}
              {!canPush && !tooMany && (
                <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '0.6rem' }}>
                  Check exactly one change to enable Push.
                </p>
              )}
              <div className="card table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th title="Queue for push">Push</th>
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
                        <td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: '0.6rem' }}>
                          <QueueForPushToggle
                            changeId={c.id}
                            checked={!!c.fields.Queue_For_Push}
                            onToggle={reload}
                          />
                        </td>
                        <td>{c.fields.Change_Title ?? '—'}</td>
                        <td>{c.fields.Change_Type ?? '—'}</td>
                        <td>{c.fields.Change_Status ?? '—'}</td>
                        <td>{fmt(c.fields.Pushed_Datetime)}</td>
                        <td>
                          {canPush && c.fields.Queue_For_Push ? (
                            <PushPromptBtn
                              changeId={c.id}
                              chatbotRecordId={recordId!}
                              onDone={reload}
                            />
                          ) : (
                            <button
                              className="btn btn-sm btn-primary"
                              disabled
                              title={tooMany ? 'Uncheck other changes first' : 'Check this change to enable push'}
                            >
                              Push
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          );
        })()}
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
