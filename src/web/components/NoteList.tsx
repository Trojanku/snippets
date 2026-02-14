import { useMemo, useState } from "react";
import { useApp } from "../App.tsx";

export function NoteList() {
  const { state, openNote } = useApp();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [theme, setTheme] = useState("all");

  const allThemes = useMemo(
    () => Array.from(new Set(state.notes.flatMap((n) => n.themes || []))).sort(),
    [state.notes]
  );

  const filtered = useMemo(() => {
    return state.notes.filter((n) => {
      const matchesKind = kind === "all" || (n.kind || "unknown") === kind;
      const matchesTheme = theme === "all" || (n.themes || []).includes(theme);
      const hay = `${n.title || ""} ${n.summary || ""} ${(n.themes || []).join(" ")}`.toLowerCase();
      const matchesQuery = !query.trim() || hay.includes(query.toLowerCase());
      return matchesKind && matchesTheme && matchesQuery;
    });
  }, [state.notes, kind, theme, query]);

  if (state.notes.length === 0) {
    return <div className="empty">No notes yet. Capture something!</div>;
  }

  return (
    <section>
      <div className="note-card-date">Notes stream · {filtered.length} shown</div>
      <div className="filters">
        <input
          className="filter-input"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="filter-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All kinds</option>
          <option value="knowledge">Knowledge</option>
          <option value="action">Action</option>
          <option value="idea">Idea</option>
          <option value="journal">Journal</option>
          <option value="reference">Reference</option>
          <option value="unknown">Unknown</option>
        </select>
        <select className="filter-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="all">All themes</option>
          {allThemes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="note-list">
        {filtered.map((n) => (
          <button key={n.id} className="note-card" onClick={() => openNote(n.id)}>
            <div className="note-card-title">{n.title || n.id}</div>
            <div className="note-card-date">{new Date(n.created).toLocaleDateString()}</div>
            {n.summary && <div className="note-card-summary">{n.summary}</div>}
            {n.themes && n.themes.length > 0 && (
              <div className="tags">
                {n.themes.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
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
    </section>
  );
}
