import { useMemo } from "react";
import { useApp } from "../App.tsx";

function inSelectedFolder(noteFolderPath: string | undefined, selectedFolder: string): boolean {
  const folder = noteFolderPath || "";
  if (!selectedFolder) return true;
  return folder === selectedFolder || folder.startsWith(`${selectedFolder}/`);
}

export function TaskList() {
  const { state, openNote } = useApp();

  const taskNotes = useMemo(() => {
    return state.notes.filter((n) => {
      if (!inSelectedFolder(n.folderPath, state.selectedFolder)) return false;
      const clearActionability = n.actionability === "clear";
      const hasActionItems = (n.suggestedActions || []).some((a) => a.type === "create-task");
      return clearActionability || hasActionItems || n.kind === "action";
    });
  }, [state.notes, state.selectedFolder]);

  if (taskNotes.length === 0) {
    return (
      <div className="empty">
        No actionable notes yet.
        <div className="muted">Capture notes naturally — tasks appear only when intent is explicit.</div>
      </div>
    );
  }

  return (
    <div className="note-list agenda-list">
      <div className="note-card agenda-header">
        <div className="note-card-title">Action Agenda</div>
        <div className="note-card-date">{taskNotes.length} actionable notes</div>
      </div>

      {taskNotes.map((n) => (
        <button key={n.id} className="note-card agenda-item" onClick={() => void openNote(n.id)}>
          <div className="note-card-title">{n.title || n.id}</div>
          {n.summary && <div className="note-card-summary">{n.summary}</div>}
          {n.folderPath && <div className="note-path">{n.folderPath}</div>}
          <div className="badges-row">
            <span className={`badge badge-actionability action-${n.actionability || "none"}`}>
              {n.actionability || "none"}
            </span>
            <span className={`status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
