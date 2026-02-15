import Markdown from "react-markdown";
import { useEffect, useRef, useState } from "react";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

interface SuggestedAction {
  type: string;
  label: string;
  assignee?: "user" | "agent";
  priority?: "low" | "medium" | "high";
  status?: "pending" | "completed" | "declined";
  result?: string;
  jobId?: string;
  jobStatus?: "running" | "completed" | "failed";
  jobStartedAt?: string;
  linkedNoteId?: string;
  linkedNoteTitle?: string;
}

interface ActionEditState {
  actionIndex: number;
  result: string;
}

interface SuggestedActionsPanelProps {
  sticky?: boolean;
}

export function SuggestedActionsPanel({ sticky = true }: SuggestedActionsPanelProps) {
  const { state, refresh, openNote } = useApp();
  const fm = state.activeNote?.frontmatter;
  const noteId = fm?.id ?? null;
  const [actionEditing, setActionEditing] = useState<ActionEditState | null>(null);
  const [runningActions, setRunningActions] = useState<Record<number, boolean>>({});
  const pollTimersRef = useRef<Map<number, ReturnType<typeof setInterval>>>(new Map());

  const suggestedActions: SuggestedAction[] = fm?.suggestedActions || [];

  useEffect(() => {
    for (const timer of pollTimersRef.current.values()) {
      clearInterval(timer);
    }
    pollTimersRef.current.clear();
    setActionEditing(null);
    setRunningActions({});
  }, [noteId]);

  useEffect(() => {
    return () => {
      for (const timer of pollTimersRef.current.values()) {
        clearInterval(timer);
      }
      pollTimersRef.current.clear();
    };
  }, []);

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

  async function handleCompleteAction(actionIndex: number, result?: string) {
    if (!noteId) return;
    await api.completeAction(noteId, actionIndex, result);
    await refresh();
    await openNote(noteId);
    setActionEditing(null);
  }

  async function handleDeclineAction(actionIndex: number) {
    if (!noteId) return;
    await api.declineAction(noteId, actionIndex);
    await refresh();
    await openNote(noteId);
  }

  async function handleRunAction(actionIndex: number) {
    if (!noteId) return;
    const existingTimer = pollTimersRef.current.get(actionIndex);
    if (existingTimer) {
      clearInterval(existingTimer);
      pollTimersRef.current.delete(actionIndex);
    }
    setRunningActions((prev) => ({ ...prev, [actionIndex]: true }));
    try {
      const result = await api.runAgentAction(noteId, actionIndex);
      if (!result?.jobId) {
        setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
        return;
      }

      const pollInterval = setInterval(async () => {
        try {
          const status = await api.checkAgentActionStatus(noteId, actionIndex);
          if (status?.status !== "running") {
            clearInterval(pollInterval);
            pollTimersRef.current.delete(actionIndex);
            setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
            await refresh();
            await openNote(noteId);
          }
        } catch {
          // Continue polling through transient backend failures.
        }
      }, 1000);

      pollTimersRef.current.set(actionIndex, pollInterval);
    } catch {
      setRunningActions((prev) => ({ ...prev, [actionIndex]: false }));
    }
  }

  if (!noteId) return null;

  const containerClass = sticky
    ? "panel panel-rail sticky top-24 flex max-h-[calc(100vh-112px)] flex-col overflow-hidden p-3.5 max-[1060px]:static max-[1060px]:max-h-none"
    : "panel panel-rail flex min-h-0 flex-col overflow-hidden p-3.5";

  return (
    <aside className={containerClass}>
      <div className="mb-3 border-b border-line/70 pb-3">
        <h3 className="text-xs uppercase tracking-widest text-ink-soft">Suggested actions</h3>
        <p className="text-sm text-ink-soft">Execution cues for this note.</p>
      </div>

      {suggestedActions.length === 0 ? (
        <p className="text-sm text-ink-soft">No actions yet.</p>
      ) : (
        <div className="flex min-h-0 flex-col gap-3 overflow-auto pr-1">
          {suggestedActions.map((a, i) => {
            const isAgent = a.assignee === "agent";
            const isCompleted = a.status === "completed";
            const isPriority = a.priority === "high";
            const isRunning = !isCompleted && (a.jobStatus === "running" || runningActions[i]);
            const statusLabel = isCompleted ? "Completed" : isRunning ? "Running" : "Pending";

            return (
              <div
                key={i}
                className={`flex flex-col gap-2.5 rounded-xl border px-3 py-3 ${
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
                    className={`rounded-lg border px-3 py-2 ${
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
                      <button className="btn-muted" onClick={() => handleRunAction(i)}>
                        Run
                      </button>
                    )}
                    {isAgent && isCompleted && !isRunning && (
                      <button className="btn-muted" onClick={() => handleRunAction(i)}>
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
                        onClick={() => setActionEditing({ actionIndex: i, result: a.result || "" })}
                      >
                        Done
                      </button>
                    )}
                    {!isCompleted && (
                      <button
                        className="btn border-danger/40 text-danger hover:bg-danger-soft"
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
      )}
    </aside>
  );
}
