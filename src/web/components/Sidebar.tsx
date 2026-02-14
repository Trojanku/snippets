import { useApp } from "../App.tsx";

export function Sidebar() {
  const { state, openNote } = useApp();
  const { activeNote, connections, notes } = state;

  const relatedNotes =
    activeNote
      ? connections.edges
          .filter(
            (e) =>
              e.source === activeNote.frontmatter.id ||
              e.target === activeNote.frontmatter.id
          )
          .map((e) => {
            const otherId =
              e.source === activeNote.frontmatter.id ? e.target : e.source;
            const other = notes.find((n) => n.id === otherId);
            return { ...e, otherId, otherTitle: other?.title || otherId };
          })
          .sort((a, b) => b.strength - a.strength)
      : [];

  const allThemes = Array.from(
    new Set(notes.flatMap((n) => n.themes || []))
  ).sort();

  return (
    <aside className="sidebar">
      {activeNote ? (
        <>
          <h3>Connections</h3>
          {relatedNotes.length === 0 ? (
            <p className="muted">No connections yet</p>
          ) : (
            <ul className="connection-list">
              {relatedNotes.map((r) => (
                <li key={r.otherId}>
                  <button onClick={() => openNote(r.otherId)}>
                    {r.otherTitle}
                  </button>
                  <span className="muted">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}

          {activeNote.frontmatter.suggestedActions &&
            activeNote.frontmatter.suggestedActions.length > 0 && (
              <>
                <h3>Actions</h3>
                <ul>
                  {activeNote.frontmatter.suggestedActions.map((a, i) => (
                    <li key={i} className="action-item">
                      {a.label}
                    </li>
                  ))}
                </ul>
              </>
            )}
        </>
      ) : (
        <>
          <h3>Themes</h3>
          {allThemes.length === 0 ? (
            <p className="muted">No themes yet</p>
          ) : (
            <div className="tags">
              {allThemes.map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          )}
        </>
      )}

      <div className="sidebar-footer">
        <p className="muted">{notes.length} notes</p>
      </div>
    </aside>
  );
}
