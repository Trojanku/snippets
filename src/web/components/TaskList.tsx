import { useApp } from "../App.tsx";

export function TaskList() {
  const { state, openNote } = useApp();

  const taskNotes = state.notes.filter((n) => {
    const clearActionability = n.actionability === "clear";
    const hasActionItems = (n.suggestedActions || []).some((a) => a.type === "create-task");
    return clearActionability || hasActionItems || n.kind === "action";
  });

  if (taskNotes.length === 0) {
    return (
      <div className="empty">
        No actionable notes yet.
        <div className="muted">Capture notes naturally — tasks appear only when intent is explicit.</div>
      </div>
    );
  }

  return (
    <div className="note-list">
      {taskNotes.map((n) => (
        <button key={n.id} className="note-card" onClick={() => openNote(n.id)}>
          <div className="note-card-title">{n.title || n.id}</div>
          <div className="note-card-date">{new Date(n.created).toLocaleString()}</div>
          {n.summary && <div className="note-card-summary">{n.summary}</div>}
          <div className="badges-row">
            <span className="badge badge-kind">{n.kind || "unknown"}</span>
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
