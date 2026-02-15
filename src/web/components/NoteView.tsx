import Markdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

interface ActionEditState {
  actionIndex: number;
  result: string;
}

type SaveState = "idle" | "typing" | "saving" | "saved" | "error";

export function NoteView() {
  const { state, openNote, refresh, dispatch } = useApp();
  const note = state.activeNote;
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<string>("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionEditing, setActionEditing] = useState<ActionEditState | null>(null);
  const [runningActions, setRunningActions] = useState<Record<number, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string>("");

  if (!note) return null;

  const { frontmatter: fm, content } = note;

  useEffect(() => {
    setRunningActions({});
  }, [fm.id]);

  useEffect(() => {
    setRunningActions((prev) => {
      const actions = fm.suggestedActions || [];
      let changed = false;
      const next = { ...prev };

      for (const key of Object.keys(next)) {
        const idx = Number(key);
        const action = actions[idx];
        if (!action || action.jobStatus !== "running") {
          delete next[idx];
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [fm.suggestedActions, fm.updated]);

  useEffect(() => {
    setDraftContent(content);
    draftRef.current = content;
    setSaveState("idle");
    setSaveError(null);
  }, [fm.id]);

  useEffect(() => {
    draftRef.current = draftContent;

    if (draftContent.trim() === content.trim()) {
      setSaveState((prev) => (prev === "typing" ? "idle" : prev));
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      return;
    }

    setSaveState("typing");
    setSaveError(null);

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const valueToSave = draftContent;

    saveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const updated = await api.saveNote(fm.id, valueToSave);
        if (!updated) {
          setSaveState("error");
          setSaveError("Save failed");
          return;
        }

        // Avoid stomping newer local edits if user kept typing while request was in flight.
        if (draftRef.current === valueToSave) {
          dispatch({ type: "SET_ACTIVE_NOTE", note: updated });
          setSaveState("saved");
          setTimeout(() => {
            setSaveState((prev) => (prev === "saved" ? "idle" : prev));
          }, 1500);
        }
      } catch (err) {
        setSaveState("error");
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    }, 700);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [draftContent, content, fm.id, dispatch]);

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    const res = await api.retryNote(fm.id);
    if (!res.ok) {
      setRetryError(res.error || "Retry failed");
    }
    await refresh();
    await openNote(fm.id);
    setRetrying(false);
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
    setRunningActions((prev) => ({ ...prev, [actionIndex]: true }));
    try {
      const result = await api.runAgentAction(fm.id, actionIndex);
      if (!result?.jobId) {
        setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
        return;
      }

      const pollInterval = setInterval(async () => {
        try {
          const status = await api.checkAgentActionStatus(fm.id, actionIndex);
          if (status?.status !== "running") {
            clearInterval(pollInterval);
            setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
            await refresh();
            await openNote(fm.id);
          }
        } catch {
          // Keep polling; transient backend restarts should not freeze UI state.
        }
      }, 1000);
    } catch {
      setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
    }
  }

  async function handleDeleteNote() {
    setIsDeleting(true);
    try {
      await api.deleteNote(fm.id);
      await refresh();
      dispatch({ type: "SET_ACTIVE_NOTE", note: null });
      dispatch({ type: "SET_VIEW", view: "list" });
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  return (
    <article className="surface flex flex-col gap-5">
      {deleteConfirm && (
        <div className="rounded-lg border border-danger/60 bg-danger-soft px-3.5 py-3.5">
          <p className="mb-2.5 text-sm text-danger">
            Are you sure you want to delete this note? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              className="btn border-danger bg-danger text-paper hover:opacity-90"
              onClick={handleDeleteNote}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Yes, delete"}
            </button>
            <button
              className="btn-muted"
              onClick={() => setDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-6xl font-semibold leading-tight">{fm.title || fm.id}</h1>
          {fm.folderPath && (
            <div className="mb-1 text-xs uppercase tracking-widest text-ink-soft">{fm.folderPath}</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs uppercase tracking-widest text-ink-soft">
            {saveState === "typing" && "Typing..."}
            {saveState === "saving" && "Saving..."}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Save failed"}
          </span>
          {!deleteConfirm && (
            <button
              className="btn border-danger/40 text-danger hover:bg-danger-soft"
              onClick={() => setDeleteConfirm(true)}
              title="Delete note"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2.5 text-xs uppercase tracking-widest text-ink-soft">
        <span>{new Date(fm.created).toLocaleString()}</span>
        {fm.status && <span className={`status status-${fm.status}`}>{fm.status}</span>}
        <span className="badge">{fm.kind || "unknown"}</span>
        <span className={`badge action-${fm.actionability || "none"}`}>
          {fm.actionability === "clear" ? "Clear" : fm.actionability === "maybe" ? "Maybe" : "None"}
        </span>
        {typeof fm.classificationConfidence === "number" && (
          <span>confidence {(fm.classificationConfidence * 100).toFixed(0)}%</span>
        )}
      </div>

      {fm.themes && fm.themes.length > 0 && (
        <div className="flex flex-wrap gap-1.75">
          {fm.themes.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}

      {fm.summary && (
        <blockquote className="rounded-lg border-l-2 border-line bg-paper-deep/35 px-4 py-2 italic text-ink-soft">
          {fm.summary}
        </blockquote>
      )}

      {(fm.status === "failed" || fm.processingError) && (
        <div className="flex flex-wrap items-center gap-2.25 rounded-lg border border-danger/60 bg-danger-soft px-3.25 py-2.75">
          <p className="text-sm text-danger">Processing failed: {fm.processingError || "unknown error"}</p>
          <button
            className="btn border-danger/70 text-danger hover:bg-danger/20"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? "Retrying..." : "Retry processing"}
          </button>
          {retryError && <p className="text-sm text-danger">{retryError}</p>}
        </div>
      )}

      <div className="rounded-xl border border-line/80 bg-paper/45 px-4.5 py-4.5">
        <textarea
          className="control min-h-70 w-full resize-y rounded-lg bg-paper px-3 py-3 font-sans text-base leading-1.6"
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          placeholder="Write freely — saves automatically."
        />
        <p className="mt-2.5 text-xs italic text-ink-soft">
          Auto-save runs in the background and reprocessing updates themes/actions progressively.
        </p>
        {saveError && <p className="mt-1.5 text-xs text-danger">{saveError}</p>}
      </div>

      {fm.suggestedActions && fm.suggestedActions.length > 0 && (
        <section className="mt-2 border-t border-line pt-5">
          <h3 className="mb-3.5 font-serif text-5 font-semibold text-ink">Suggested Actions</h3>
          <div className="flex flex-col gap-3">
            {fm.suggestedActions.map((a, i) => {
              const isAgent = a.assignee === "agent";
              const isCompleted = a.status === "completed";
              const isPriority = a.priority === "high";
              const isRunning = !isCompleted && (a.jobStatus === "running" || runningActions[i]);
              const statusLabel = isCompleted ? "Completed" : isRunning ? "Running" : "Pending";

              return (
                <div
                  key={i}
                  className={`flex flex-col gap-2.5 rounded-xl border px-3.5 py-3.5 ${
                    isCompleted
                      ? "border-accent/45 bg-accent-soft/20"
                      : "border-line/80 bg-paper/45"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-widest text-ink-soft">
                      {isAgent ? "Agent" : "You"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`status ${isCompleted ? "status-processed" : isRunning ? "status-processing" : "status-queued"}`}>
                        {statusLabel}
                      </span>
                      {isPriority && (
                        <span className="rounded-full border border-caution/50 bg-caution/15 px-2 py-0.5 text-xs uppercase tracking-widest text-caution">
                          High
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-1.5 text-ink">{a.label}</p>
                  {isRunning && (
                    <p className="animate-pulse text-xs font-semibold uppercase tracking-wider text-accent">Running…</p>
                  )}
                  {a.result && (
                    <div className={`rounded-lg border px-3 py-2.5 ${
                      a.result.startsWith("Action completed successfully. No detailed result")
                        ? "border-line/60 bg-paper-deep/30"
                        : "border-accent/45 bg-accent-soft/25"
                    }`}>
                      <p className="mb-1 text-[11px] uppercase tracking-widest text-ink-soft">Result</p>
                      <div className="action-result-content text-sm leading-1.6 text-ink">
                        <Markdown>{a.result}</Markdown>
                      </div>
                      {a.linkedNoteId && (
                        <button
                          className="mt-2 text-xs font-semibold text-focus hover:underline"
                          onClick={() => void openNote(a.linkedNoteId!)}
                        >
                          Open generated note{a.linkedNoteTitle ? `: ${a.linkedNoteTitle}` : ""}
                        </button>
                      )}
                    </div>
                  )}

                  {actionEditing?.actionIndex === i ? (
                    <div className="flex flex-col gap-2">
                      <textarea
                        className="control min-h-12.5 resize-y bg-paper px-2 py-2 text-xs"
                        value={actionEditing.result}
                        onChange={(e) =>
                          setActionEditing({ ...actionEditing, result: e.target.value })
                        }
                        placeholder="What's the result/outcome? (optional)"
                      />
                      <div className="flex gap-2">
                        <button
                          className="btn-accent"
                          onClick={() => handleCompleteAction(i, actionEditing.result || undefined)}
                        >
                          Done
                        </button>
                        <button className="btn-muted" onClick={() => setActionEditing(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {isAgent && !isCompleted && !isRunning && (
                        <button className="btn-muted" title="Run this action" onClick={() => handleRunAction(i)}>
                          Run
                        </button>
                      )}
                      {isAgent && isCompleted && !isRunning && (
                        <button className="btn-muted" title="Re-run this action" onClick={() => handleRunAction(i)}>
                          Re-run
                        </button>
                      )}
                      {isRunning && (
                        <button className="btn-muted" disabled>
                          Running...
                        </button>
                      )}
                      {!isCompleted && (
                        <button
                          className="btn-muted"
                          title="Mark as done"
                          onClick={() => setActionEditing({ actionIndex: i, result: a.result || "" })}
                        >
                          Done
                        </button>
                      )}
                      {!isCompleted && (
                        <button
                          className="btn border-danger/40 text-danger hover:bg-danger-soft"
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
        </section>
      )}
    </article>
  );
}
