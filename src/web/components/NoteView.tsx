import Markdown from "react-markdown";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";
import { RichMarkdownEditor } from "./RichMarkdownEditor.tsx";

interface ActionEditState {
  actionIndex: number;
  result: string;
}

type SaveState = "idle" | "typing" | "saving" | "saved" | "error";
type EditorMode = "raw" | "rich";
type TitleSaveState = "idle" | "saving" | "error";

function isProcessing(status?: string): boolean {
  return status === "queued" || status === "processing";
}

export function NoteView() {
  const { state, openNote, refresh, dispatch } = useApp();
  const note = state.activeNote;
  const noteId = note?.frontmatter.id ?? null;
  const serverContent = note?.content ?? "";

  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState<string>(serverContent);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionEditing, setActionEditing] = useState<ActionEditState | null>(null);
  const [runningActions, setRunningActions] = useState<Record<number, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("rich");
  const [titleDraft, setTitleDraft] = useState("");
  const [titleSaveState, setTitleSaveState] = useState<TitleSaveState>("idle");
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef<string>(serverContent);
  const serverContentRef = useRef<string>(serverContent);
  const activeNoteRef = useRef<string | null>(noteId);
  const requestSeqRef = useRef(0);
  const creatingRef = useRef(false);
  const pollTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());
  const savePulseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleSaveSeqRef = useRef(0);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const fm = note?.frontmatter ?? null;

  const hasUnsavedEdits = draftContent.trim() !== serverContentRef.current.trim();

  const quietStateLabel = useMemo(() => {
    if (saveState === "typing") return "Typing";
    if (saveState === "saving") return "Saving";
    if (saveState === "saved") return "Saved";
    if (saveState === "error") return "Error";
    if (fm && isProcessing(fm.status)) return "Processing";
    if (fm?.status === "processed") return "Enhanced";
    if (!noteId && draftContent.trim()) return "Typing";
    return "Saved";
  }, [saveState, fm, noteId, draftContent]);

  const titleStateLabel =
    titleSaveState === "saving" ? "Saving title" : titleSaveState === "error" ? "Title error" : null;

  useEffect(() => {
    const saved = localStorage.getItem("notes-editor-mode");
    if (saved === "raw" || saved === "rich") {
      setEditorMode(saved);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("notes-editor-mode", editorMode);
  }, [editorMode]);

  useEffect(() => {
    function onFocusTitle() {
      const input = titleInputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    }
    window.addEventListener("focus-note-title", onFocusTitle);
    return () => {
      window.removeEventListener("focus-note-title", onFocusTitle);
    };
  }, []);

  useEffect(() => {
    titleSaveSeqRef.current += 1;
    setTitleSaveState("idle");
    setTitleSaveError(null);
  }, [fm?.id]);

  useEffect(() => {
    setTitleDraft(fm?.title || "");
  }, [fm?.id, fm?.title]);

  useEffect(() => {
    const nextId = noteId;
    const previousId = activeNoteRef.current;
    if (previousId !== nextId) {
      requestSeqRef.current += 1;
      const preserveDraftOnCreate =
        previousId === null &&
        nextId !== null &&
        draftRef.current.trim().length > 0 &&
        draftRef.current.trim() !== serverContent.trim();

      creatingRef.current = false;
      for (const timer of pollTimersRef.current.values()) {
        clearInterval(timer);
      }
      pollTimersRef.current.clear();
      activeNoteRef.current = nextId;
      serverContentRef.current = serverContent;
      if (!preserveDraftOnCreate) {
        draftRef.current = serverContent;
        setDraftContent(serverContent);
        setSaveState("idle");
      } else {
        setSaveState("typing");
      }
      setSaveError(null);
      setRetryError(null);
      setDeleteConfirm(false);
      setActionEditing(null);
      setRunningActions({});
      return;
    }

    const incoming = serverContent;
    const localDirty = draftRef.current.trim() !== serverContentRef.current.trim();
    serverContentRef.current = incoming;
    if (!localDirty && draftRef.current !== incoming) {
      draftRef.current = incoming;
      setDraftContent(incoming);
    }
  }, [noteId, serverContent]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savePulseRef.current) clearTimeout(savePulseRef.current);
      for (const timer of pollTimersRef.current.values()) {
        clearInterval(timer);
      }
      pollTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    draftRef.current = draftContent;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const trimmed = draftContent.trim();
    const hasContent = trimmed.length > 0;

    if (!hasContent) {
      setSaveState("idle");
      setSaveError(null);
      return;
    }

    if (!noteId && creatingRef.current) {
      setSaveState("saving");
      return;
    }

    const unchanged = trimmed === serverContentRef.current.trim();
    if (noteId && unchanged) {
      setSaveState((prev) => (prev === "typing" ? "idle" : prev));
      return;
    }

    if (!noteId && trimmed.length < 3) {
      setSaveState("typing");
      return;
    }

    setSaveState("typing");
    setSaveError(null);

    const valueToPersist = trimmed;
    const requestId = ++requestSeqRef.current;

    saveTimerRef.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        if (!activeNoteRef.current) {
          creatingRef.current = true;
          const created = await api.createNote(valueToPersist);
          creatingRef.current = false;
          if (requestId !== requestSeqRef.current) return;

          serverContentRef.current = created.content;
          dispatch({ type: "SET_ACTIVE_NOTE", note: created });
          const [notes, tree] = await Promise.all([api.listNotes(), api.getTree()]);
          dispatch({ type: "SET_NOTES", notes });
          dispatch({ type: "SET_TREE", tree });
        } else {
          const updated = await api.saveNote(activeNoteRef.current, valueToPersist);
          if (!updated) {
            setSaveState("error");
            setSaveError("Failed to save");
            return;
          }
          if (requestId !== requestSeqRef.current) return;
          serverContentRef.current = updated.content;
          dispatch({ type: "SET_ACTIVE_NOTE", note: updated });
        }

        if (draftRef.current.trim() === valueToPersist) {
          setSaveState("saved");
          if (savePulseRef.current) clearTimeout(savePulseRef.current);
          savePulseRef.current = setTimeout(() => {
            setSaveState((prev) => (prev === "saved" ? "idle" : prev));
          }, 1200);
        }
      } catch (err) {
        creatingRef.current = false;
        if (requestId !== requestSeqRef.current) return;
        setSaveState("error");
        setSaveError(err instanceof Error ? err.message : String(err));
      }
    }, 650);
  }, [draftContent, noteId, dispatch]);

  useEffect(() => {
    if (!fm?.id) return;
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
  }, [fm?.id, fm?.suggestedActions, fm?.updated]);

  async function handleRetry() {
    if (!fm?.id) return;
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
    if (!fm?.id) return;
    await api.completeAction(fm.id, actionIndex, result);
    await refresh();
    await openNote(fm.id);
    setActionEditing(null);
  }

  async function handleDeclineAction(actionIndex: number) {
    if (!fm?.id) return;
    await api.declineAction(fm.id, actionIndex);
    await refresh();
    await openNote(fm.id);
  }

  async function handleRunAction(actionIndex: number) {
    if (!fm?.id) return;
    const existingTimer = pollTimersRef.current.get(actionIndex);
    if (existingTimer) {
      clearInterval(existingTimer);
      pollTimersRef.current.delete(actionIndex);
    }
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
            pollTimersRef.current.delete(actionIndex);
            setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
            await refresh();
            await openNote(fm.id);
          }
        } catch {
          // Keep polling. Backend restarts should not freeze UI.
        }
      }, 1000);

      pollTimersRef.current.set(actionIndex, pollInterval);
    } catch {
      setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
    }
  }

  async function handleDeleteNote() {
    if (!fm?.id) return;
    setIsDeleting(true);
    try {
      await api.deleteNote(fm.id);
      await refresh();
      dispatch({ type: "SET_ACTIVE_NOTE", note: null });
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function handleTitleCommit() {
    if (!fm?.id) return;
    const normalized = titleDraft.trim();
    const currentTitle = (fm.title || "").trim();
    if (normalized === currentTitle) {
      if (titleSaveState === "error") {
        setTitleSaveState("idle");
        setTitleSaveError(null);
      }
      return;
    }

    const saveId = ++titleSaveSeqRef.current;
    const noteIdAtSave = fm.id;
    setTitleSaveState("saving");
    setTitleSaveError(null);

    try {
      const updated = await api.updateNoteMeta(noteIdAtSave, { title: normalized });
      if (!updated) {
        if (saveId !== titleSaveSeqRef.current) return;
        setTitleSaveState("error");
        setTitleSaveError("Failed to save title");
        return;
      }
      if (saveId !== titleSaveSeqRef.current) return;
      dispatch({ type: "SET_ACTIVE_NOTE", note: updated });
      const notesList = await api.listNotes();
      if (saveId !== titleSaveSeqRef.current) return;
      dispatch({ type: "SET_NOTES", notes: notesList });
      setTitleSaveState("idle");
    } catch (err) {
      if (saveId !== titleSaveSeqRef.current) return;
      setTitleSaveState("error");
      setTitleSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <article className="stream-editor flex flex-col gap-5">
      {deleteConfirm && fm && (
        <div className="rounded-lg border border-danger/60 bg-danger-soft px-3.5 py-3.5">
          <p className="mb-2.5 text-sm text-danger">
            Delete this note permanently?
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
          <input
            ref={titleInputRef}
            className="note-title-input"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void handleTitleCommit()}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            placeholder="Untitled note"
            maxLength={180}
          />
          {fm?.folderPath && (
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink-soft">{fm.folderPath}</p>
          )}
          {titleSaveError && <p className="mt-1 text-xs text-danger">{titleSaveError}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="editor-mode-toggle">
            <button
              className={`editor-mode-btn ${editorMode === "raw" ? "editor-mode-btn-active" : ""}`}
              onClick={() => setEditorMode("raw")}
              type="button"
            >
              Raw
            </button>
            <button
              className={`editor-mode-btn ${editorMode === "rich" ? "editor-mode-btn-active" : ""}`}
              onClick={() => setEditorMode("rich")}
              type="button"
            >
              Rich
            </button>
          </div>
          {titleStateLabel && <span className="text-xs uppercase tracking-[0.16em] text-ink-soft">{titleStateLabel}</span>}
          <span className="text-xs uppercase tracking-[0.16em] text-ink-soft">{quietStateLabel}</span>
          {fm && !deleteConfirm && (
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

      {fm && (
        <div className="flex flex-wrap items-center gap-2.5 text-xs uppercase tracking-[0.14em] text-ink-soft">
          <span>{new Date(fm.updated || fm.created).toLocaleString()}</span>
          {fm.status && <span className={`status status-${fm.status}`}>{fm.status}</span>}
          {fm.kind && fm.kind !== "unknown" && <span className="badge">{fm.kind}</span>}
          {fm.actionability && fm.actionability !== "none" && (
            <span className={`badge action-${fm.actionability}`}>
              {fm.actionability === "clear" ? "Clear" : "Maybe"}
            </span>
          )}
        </div>
      )}

      {fm?.themes && fm.themes.length > 0 && (
        <div className="flex flex-wrap gap-1.75">
          {fm.themes.map((t) => (
            <span key={t} className="chip">
              {t}
            </span>
          ))}
        </div>
      )}

      {fm?.summary && (
        <blockquote className="rounded-lg border-l-2 border-line bg-paper-deep/35 px-4 py-2 italic text-ink-soft">
          {fm.summary}
        </blockquote>
      )}

      {fm && (fm.status === "failed" || fm.processingError) && (
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

      <div className={`stream-writer-surface ${editorMode === "rich" ? "stream-writer-surface-rich" : ""}`}>
        {editorMode === "raw" ? (
          <div className="stream-editor-pane">
            <textarea
              className="stream-textarea"
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              placeholder="Write freely. Autosave and enrichment run quietly."
              autoFocus={!noteId}
            />
          </div>
        ) : (
          <RichMarkdownEditor
            value={draftContent}
            onChange={setDraftContent}
            autoFocus={!noteId}
          />
        )}
        <p className="mt-2 text-xs text-ink-soft">
          {noteId
            ? "You can keep writing while metadata and actions update in place."
            : "This note is created automatically after a short pause (min 3 characters)."}
        </p>
        {saveError && <p className="mt-1 text-xs text-danger">{saveError}</p>}
        {hasUnsavedEdits && quietStateLabel !== "Saving" && (
          <p className="mt-1 text-xs text-ink-soft">Pending local draft</p>
        )}
      </div>

      {fm?.suggestedActions && fm.suggestedActions.length > 0 && (
        <section className="mt-1 border-t border-line pt-4">
          <h3 className="mb-3 font-serif text-5 font-semibold text-ink">Suggested actions</h3>
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
                    <span className="text-xs uppercase tracking-[0.14em] text-ink-soft">
                      {isAgent ? "Agent" : "You"}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`status ${isCompleted ? "status-processed" : isRunning ? "status-processing" : "status-queued"}`}>
                        {statusLabel}
                      </span>
                      {isPriority && (
                        <span className="rounded-full border border-caution/50 bg-caution/15 px-2 py-0.5 text-xs uppercase tracking-[0.14em] text-caution">
                          High
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm leading-1.5 text-ink">{a.label}</p>
                  {isRunning && (
                    <p className="animate-pulse text-xs font-semibold uppercase tracking-wider text-accent">Running...</p>
                  )}
                  {a.result && (
                    <div
                      className={`rounded-lg border px-3 py-2.5 ${
                        a.result.startsWith("Action completed successfully. No detailed result")
                          ? "border-line/60 bg-paper-deep/30"
                          : "border-accent/45 bg-accent-soft/25"
                      }`}
                    >
                      <p className="mb-1 text-[11px] uppercase tracking-[0.14em] text-ink-soft">Result</p>
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
                        placeholder="Outcome (optional)"
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
