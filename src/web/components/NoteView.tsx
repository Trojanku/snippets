import Markdown from "react-markdown";
import { useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";
import type { FullNote } from "../lib/api.ts";

interface ActionEditState {
  actionIndex: number;
  result: string;
}

export function NoteView() {
  const { state, openNote, refresh, dispatch } = useApp();
  const note = state.activeNote;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionEditing, setActionEditing] = useState<ActionEditState | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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

  async function handleCompleteAction(actionIndex: number, result?: string) {
    await api.completeAction(fm.id, actionIndex, result);
    await refresh();
    await openNote(fm.id);
    setActionEditing(null);
  }

  async function handleDeclineAction(actionIndex: number) {
    await api.declineAction(fm.id, actionIndex);
    await refresh();
    await openNote(fm.id);
  }

  async function handleRunAction(actionIndex: number) {
    const result = await api.runAgentAction(fm.id, actionIndex);
    if (result?.jobId) {
      setRunningJobId(result.jobId);
      // Start polling for status
      const pollInterval = setInterval(async () => {
        const status = await api.checkAgentActionStatus(fm.id, actionIndex);
        if (status?.status === "completed" || status?.status === "failed") {
          clearInterval(pollInterval);
          await refresh();
          await openNote(fm.id);
          setRunningJobId(null);
        }
      }, 1000);
    }
  }

  async function handleDeleteNote() {
    setIsDeleting(true);
    try {
      await api.deleteNote(fm.id);
      await refresh();
      // Navigate back to list
      dispatch({ type: "SET_ACTIVE_NOTE", note: null });
      dispatch({ type: "SET_VIEW", view: "list" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <div className="note-view">
      {deleteConfirm && (
        <div className="delete-confirm-box">
          <p>Are you sure you want to delete this note? This cannot be undone.</p>
          <div className="delete-confirm-actions">
            <button
              className="delete-confirm-btn"
              onClick={handleDeleteNote}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              className="delete-cancel-btn"
              onClick={() => setDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="note-view-header">
        <div>
          <h1>{fm.title || fm.id}</h1>
          {fm.folderPath && <div className="note-path note-path-detail">{fm.folderPath}</div>}
        </div>
        <div className="note-actions">
          {!isEditing && (
            <button className="edit-btn" onClick={handleStartEdit} title="Edit note">
              ✎
            </button>
          )}
          {!isEditing && !deleteConfirm && (
            <button
              className="delete-btn"
              onClick={() => setDeleteConfirm(true)}
              title="Delete note"
            >
              🗑
            </button>
          )}
        </div>
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
          <h3>💡 Suggested Actions</h3>
          <div className="action-list">
            {fm.suggestedActions.map((a, i) => {
              const isAgent = a.assignee === "agent";
              const isCompleted = a.status === "completed";
              const isPriority = a.priority === "high";
              
              return (
                <div
                  key={i}
                  className={`action-item action-${a.assignee || "user"} priority-${a.priority || "medium"} ${isCompleted ? "completed" : ""}`}
                >
                  <div className="action-header">
                    <span className="action-assignee">
                      {isAgent ? "🤖 Agent" : "👤 You"}
                    </span>
                    {isPriority && <span className="action-priority">High</span>}
                  </div>
                  <p className="action-label">{a.label}</p>
                  {a.jobStatus === "running" && (
                    <p className="action-running">⏳ Running... started {new Date(a.jobStartedAt || "").toLocaleTimeString()}</p>
                  )}
                  {a.result && <p className="action-result">✓ {a.result}</p>}
                  {actionEditing?.actionIndex === i ? (
                    <div className="action-edit">
                      <textarea
                        className="action-result-input"
                        value={actionEditing.result}
                        onChange={(e) =>
                          setActionEditing({ ...actionEditing, result: e.target.value })
                        }
                        placeholder="What's the result/outcome? (optional)"
                      />
                      <div className="action-edit-controls">
                        <button
                          className="action-save-result-btn"
                          onClick={() =>
                            handleCompleteAction(i, actionEditing.result || undefined)
                          }
                        >
                          Done ✓
                        </button>
                        <button
                          className="action-cancel-result-btn"
                          onClick={() => setActionEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="action-controls">
                      {isAgent && !isCompleted && !a.jobStatus && (
                        <button
                          className="action-run-btn"
                          title="Run this action"
                          onClick={() => handleRunAction(i)}
                        >
                          Run →
                        </button>
                      )}
                      {a.jobStatus === "running" && (
                        <button className="action-run-btn running" disabled>
                          Running...
                        </button>
                      )}
                      {!isCompleted && (
                        <button
                          className="action-done-btn"
                          title="Mark as done"
                          onClick={() =>
                            setActionEditing({ actionIndex: i, result: a.result || "" })
                          }
                        >
                          Done ✓
                        </button>
                      )}
                      {!isCompleted && (
                        <button
                          className="action-decline-btn"
                          title="Skip this action"
                          onClick={() => handleDeclineAction(i)}
                        >
                          Skip
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
