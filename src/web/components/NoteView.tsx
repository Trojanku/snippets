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
    <div className="flex flex-col gap-5 p-7 border border-line bg-gradient-to-b from-white/72 to-white/72 rounded-2xl note-view">
      {deleteConfirm && (
        <div className="p-3.5 mb-4 bg-danger-soft border border-danger rounded px-3.5 py-3.5 border-l-4 border-l-danger delete-confirm-box">
          <p className="text-sm text-danger mb-2.5">Are you sure you want to delete this note? This cannot be undone.</p>
          <div className="flex gap-2">
            <button
              className="text-xs tracking-widest uppercase px-3 py-1.75 rounded border border-danger bg-danger text-white cursor-pointer transition-all duration-120 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-opacity-90"
              onClick={handleDeleteNote}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              className="text-xs tracking-widest uppercase px-3 py-1.75 rounded border border-danger bg-transparent text-danger cursor-pointer transition-all duration-120 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-danger/10"
              onClick={() => setDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-between items-start gap-4 mb-3">
        <div>
          <h1 className="font-serif text-6xl font-semibold leading-tight">{fm.title || fm.id}</h1>
          {fm.folderPath && <div className="text-xs tracking-widest uppercase text-ink-soft mb-1">{fm.folderPath}</div>}
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {!isEditing && (
            <button className="bg-none border border-line rounded px-2 py-2 text-ink-soft cursor-pointer text-lg transition-all duration-120 hover:bg-white/60 hover:border-focus hover:text-ink" onClick={handleStartEdit} title="Edit note">
              ✎
            </button>
          )}
          {!isEditing && !deleteConfirm && (
            <button
              className="bg-none border border-line rounded px-2 py-2 text-ink-soft cursor-pointer text-lg transition-all duration-120 hover:bg-danger-soft hover:border-danger hover:text-danger"
              onClick={() => setDeleteConfirm(true)}
              title="Delete note"
            >
              🗑
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 flex-wrap text-xs text-ink-soft tracking-widest uppercase">
        <span>{new Date(fm.created).toLocaleString()}</span>
        {fm.status && (
          <span className={`px-2 py-0.5 rounded-full border status status-${fm.status}`}>{fm.status}</span>
        )}
        <span className="px-2 py-0.5 rounded-full border border-gray-300 bg-gray-100 text-gray-700 badge badge-kind">{fm.kind || "unknown"}</span>
        <span className={`px-2 py-0.5 rounded-full border badge badge-actionability action-${fm.actionability || "none"}`}>
          {fm.actionability === "clear" ? "✓ Clear" : fm.actionability === "maybe" ? "? Maybe" : "— None"}
        </span>
        {typeof fm.classificationConfidence === "number" && (
          <span className="text-ink-soft">confidence {(fm.classificationConfidence * 100).toFixed(0)}%</span>
        )}
      </div>

      {fm.themes && fm.themes.length > 0 && (
        <div className="flex flex-wrap gap-1.75">
          {fm.themes.map((t) => (
            <span key={t} className="text-xs px-2 py-0.5 border border-gray-300 bg-gray-100 text-gray-700 rounded-full tracking-widest uppercase tag">{t}</span>
          ))}
        </div>
      )}

      {fm.summary && <blockquote className="border-l-2 border-line pl-4 py-2 text-ink-soft italic bg-white/56 note-summary">{fm.summary}</blockquote>}

      {(fm.status === "failed" || fm.processingError) && (
        <div className="border border-danger bg-danger-soft rounded px-3.25 py-2.75 flex gap-2.25 items-center flex-wrap retry-box">
          <p className="text-danger text-sm">Processing failed: {fm.processingError || "unknown error"}</p>
          <button className="border border-danger/70 bg-gray-200 text-danger rounded-full px-2.75 py-1.5 cursor-pointer transition-all duration-120 uppercase text-xs tracking-widest disabled:opacity-60 disabled:cursor-not-allowed hover:bg-danger/20 retry-btn" onClick={handleRetry} disabled={retrying}>
            {retrying ? "Retrying..." : "Retry processing"}
          </button>
          {retryError && <p className="text-danger text-sm">{retryError}</p>}
        </div>
      )}

      {isEditing ? (
        <div className="my-3 px-4.5 py-4.5 bg-gradient-to-b from-white/99 to-white/98 border border-line rounded-3 note-edit-box">
          <textarea
            className="w-full min-h-70 px-3 py-3 font-sans text-base leading-1.6 border border-line rounded bg-white text-ink resize-vertical focus:outline-2 focus:outline-[rgb(var(--color-focus))] note-edit-area"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            placeholder="Edit note content..."
          />
          <div className="flex gap-2.5 mt-3">
            <button className="px-4 py-2.25 rounded border border-line text-xs tracking-widest uppercase cursor-pointer transition-all duration-120 bg-green-800 text-white disabled:opacity-55 disabled:cursor-not-allowed hover:bg-green-900 save-btn" onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save & Reprocess"}
            </button>
            <button className="px-4 py-2.25 rounded border border-line bg-transparent text-ink-soft text-xs tracking-widest uppercase cursor-pointer transition-all duration-120 disabled:opacity-55 disabled:cursor-not-allowed hover:bg-white/60 hover:text-ink cancel-btn" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </button>
          </div>
          <p className="text-xs text-ink-soft mt-2.5 italic">Saving will trigger re-categorization to detect changes in themes, kind, and actionability.</p>
        </div>
      ) : (
        <div className="font-serif text-base leading-tight text-gray-800 note-content">
          <Markdown>{content}</Markdown>
        </div>
      )}

      {fm.suggestedActions && fm.suggestedActions.length > 0 && !isEditing && (
        <div className="mt-7 pt-5 border-t border-line suggested-actions">
          <h3 className="text-sm font-semibold mb-3.5 text-ink">💡 Suggested Actions</h3>
          <div className="flex flex-col gap-3">
            {fm.suggestedActions.map((a, i) => {
              const isAgent = a.assignee === "agent";
              const isCompleted = a.status === "completed";
              const isPriority = a.priority === "high";
              
              return (
                <div
                  key={i}
                  className={`px-3.5 py-3.5 border rounded-2.5 flex flex-col gap-2 transition-all duration-120 action-item action-${a.assignee || "user"} priority-${a.priority || "medium"} ${
                    isCompleted ? "opacity-60 bg-gray-100" : isAgent ? "border-line bg-white/24" : "bg-white/62 border-line"
                  }`}
                >
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-xs tracking-widest uppercase text-ink-soft font-semibold action-assignee">
                      {isAgent ? "🤖 Agent" : "👤 You"}
                    </span>
                    {isPriority && <span className="text-xs tracking-widest uppercase px-1.5 py-0.5 rounded bg-yellow-600 text-white action-priority">High</span>}
                  </div>
                  <p className="text-sm leading-1.5 text-ink action-label">{a.label}</p>
                  {a.jobStatus === "running" && (
                    <p className="text-xs text-accent italic animate-pulse action-running">⏳ Running... started {new Date(a.jobStartedAt || "").toLocaleTimeString()}</p>
                  )}
                  {a.result && <p className="text-sm text-success italic action-result">✓ {a.result}</p>}
                  {actionEditing?.actionIndex === i ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="text-xs px-2 py-2 border border-line rounded bg-white text-ink min-h-12.5 resize-vertical font-sans focus:outline-2 focus:outline-[rgb(var(--color-focus))] action-result-input"
                        value={actionEditing.result}
                        onChange={(e) =>
                          setActionEditing({ ...actionEditing, result: e.target.value })
                        }
                        placeholder="What's the result/outcome? (optional)"
                      />
                      <div className="flex gap-2">
                        <button
                          className="text-xs tracking-widest uppercase px-2.5 py-1.5 rounded bg-green-800 text-white cursor-pointer transition-all duration-120 hover:bg-green-900 action-save-result-btn"
                          onClick={() =>
                            handleCompleteAction(i, actionEditing.result || undefined)
                          }
                        >
                          Done ✓
                        </button>
                        <button
                          className="text-xs tracking-widest uppercase px-2.5 py-1.5 rounded border border-line bg-transparent text-ink-soft cursor-pointer transition-all duration-120 hover:bg-danger/10 hover:text-danger action-cancel-result-btn"
                          onClick={() => setActionEditing(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      {isAgent && !isCompleted && !a.jobStatus && (
                        <button
                          className="text-xs tracking-widest uppercase px-2.5 py-1.5 rounded border border-line bg-transparent text-ink-soft cursor-pointer transition-all duration-120 hover:bg-green-800 hover:text-white action-run-btn"
                          title="Run this action"
                          onClick={() => handleRunAction(i)}
                        >
                          Run →
                        </button>
                      )}
                      {a.jobStatus === "running" && (
                        <button className="text-xs tracking-widest uppercase px-2.5 py-1.5 rounded border border-line bg-white/24 text-accent cursor-wait action-run-btn running" disabled>
                          Running...
                        </button>
                      )}
                      {!isCompleted && (
                        <button
                          className="text-xs tracking-widest uppercase px-2.5 py-1.5 rounded border border-line bg-transparent text-ink-soft cursor-pointer transition-all duration-120 hover:bg-success/10 hover:text-success action-done-btn"
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
                          className="text-xs tracking-widest uppercase px-2.5 py-1.5 rounded border border-line bg-transparent text-ink-soft cursor-pointer transition-all duration-120 hover:bg-red/5 hover:text-danger action-decline-btn"
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
