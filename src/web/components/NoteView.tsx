import Markdown from "react-markdown";
import { useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

export function NoteView() {
  const { state, openNote, refresh } = useApp();
  const note = state.activeNote;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  if (!note) return null;

  const { frontmatter: fm, content } = note;

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    const res = await api.retryNote(fm.id);
    if (!res.ok) {
      setRetryError(res.error || "Retry failed");
    }
    await refresh();
    openNote(fm.id);
    setRetrying(false);
  }

  return (
    <div className="note-view">
      <h1>{fm.title || fm.id}</h1>
      <div className="note-meta">
        <span>{new Date(fm.created).toLocaleString()}</span>
        {fm.status && (
          <span className={`status status-${fm.status}`}>{fm.status}</span>
        )}
        <span className="badge badge-kind">{fm.kind || "unknown"}</span>
        <span className={`badge badge-actionability action-${fm.actionability || "none"}`}>
          {fm.actionability || "none"}
        </span>
        {typeof fm.classificationConfidence === "number" && (
          <span className="muted">confidence {(fm.classificationConfidence * 100).toFixed(0)}%</span>
        )}
      </div>

      {fm.themes && fm.themes.length > 0 && (
        <div className="tags">
          {fm.themes.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}

      {fm.summary && <blockquote className="note-summary">{fm.summary}</blockquote>}

      {(fm.status === "failed" || fm.processingError) && (
        <div className="retry-box">
          <p className="retry-error">Processing failed: {fm.processingError || "unknown error"}</p>
          <button className="retry-btn" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying..." : "Retry processing"}
          </button>
          {retryError && <p className="retry-error">{retryError}</p>}
        </div>
      )}

      <div className="note-content">
        <Markdown>{content}</Markdown>
      </div>

      {fm.suggestedActions && fm.suggestedActions.length > 0 && (
        <div className="suggested-actions">
          <h3>Suggested Actions</h3>
          <div className="action-chips">
            {fm.suggestedActions.map((a, i) => (
              <span key={i} className="action-chip" data-type={a.type}>
                {a.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
