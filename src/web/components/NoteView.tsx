import Markdown from "react-markdown";
import { useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

export function NoteView() {
  const { state, openNote, refresh } = useApp();
  const note = state.activeNote;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);

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

  async function handleStartEdit() {
    setEditedContent(content);
    setIsEditing(true);
  }

  async function handleSaveEdit() {
    if (editedContent.trim() === content.trim()) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const updated = await api.saveNote(fm.id, editedContent);
      if (updated) {
        setIsEditing(false);
        await refresh();
        await openNote(fm.id);
      }
    } finally {
      setIsSaving(false);
    }
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditedContent("");
  }

  return (
    <div className="note-view">
      <div className="note-view-header">
        <div>
          <h1>{fm.title || fm.id}</h1>
          {fm.folderPath && <div className="note-path note-path-detail">{fm.folderPath}</div>}
        </div>
        {!isEditing && (
          <button className="edit-btn" onClick={handleStartEdit} title="Edit note">
            ✎
          </button>
        )}
      </div>

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

      {isEditing ? (
        <div className="note-edit-box">
          <textarea
            className="note-edit-area"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            placeholder="Edit note content..."
          />
          <div className="edit-actions">
            <button className="save-btn" onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save & Reprocess"}
            </button>
            <button className="cancel-btn" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </button>
          </div>
          <p className="edit-hint">Saving will trigger re-categorization to detect changes in themes, kind, and actionability.</p>
        </div>
      ) : (
        <div className="note-content">
          <Markdown>{content}</Markdown>
        </div>
      )}

      {fm.suggestedActions && fm.suggestedActions.length > 0 && !isEditing && (
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
