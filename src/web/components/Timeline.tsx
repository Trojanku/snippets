import { useApp } from "../App.tsx";

export function Timeline() {
  const { state, openNote } = useApp();

  const grouped = new Map<string, typeof state.notes>();
  for (const note of state.notes) {
    const themes = note.themes?.length ? note.themes : ["untagged"];
    for (const theme of themes) {
      if (!grouped.has(theme)) grouped.set(theme, []);
      grouped.get(theme)!.push(note);
    }
  }

  const sortedThemes = [...grouped.keys()].sort();

  if (state.notes.length === 0) {
    return <div className="empty">No notes yet.</div>;
  }

  return (
    <div className="timeline">
      {sortedThemes.map((theme) => (
        <section key={theme} className="timeline-group">
          <h2 className="timeline-theme">{theme}</h2>
          {grouped.get(theme)!.map((n) => (
            <button
              key={n.id}
              className="note-card"
              onClick={() => openNote(n.id)}
            >
              <div className="note-card-title">{n.title || n.id}</div>
              <div className="note-card-date">
                {new Date(n.created).toLocaleDateString()}
              </div>
              {n.summary && <div className="note-card-summary">{n.summary}</div>}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
