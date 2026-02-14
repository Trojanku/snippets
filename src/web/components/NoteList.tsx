import { useApp } from "../App.tsx";

export function NoteList() {
  const { state, openNote } = useApp();

  if (state.notes.length === 0) {
    return <div className="empty">No notes yet. Capture something!</div>;
  }

  return (
    <div className="note-list">
      {state.notes.map((n) => (
        <button key={n.id} className="note-card" onClick={() => openNote(n.id)}>
          <div className="note-card-title">{n.title || n.id}</div>
          <div className="note-card-date">
            {new Date(n.created).toLocaleDateString()}
          </div>
          {n.summary && <div className="note-card-summary">{n.summary}</div>}
          {n.themes && n.themes.length > 0 && (
            <div className="tags">
              {n.themes.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          )}
          <span className={`status status-${n.status || "raw"}`}>
            {n.status || "raw"}
          </span>
        </button>
      ))}
    </div>
  );
}
