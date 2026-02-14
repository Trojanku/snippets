import { useMemo, useState } from "react";
import { useApp } from "../App.tsx";

function inSelectedFolder(noteFolderPath: string | undefined, selectedFolder: string): boolean {
  const folder = noteFolderPath || "";
  if (!selectedFolder) return true;
  return folder === selectedFolder || folder.startsWith(`${selectedFolder}/`);
}

function isReadyToRead(n: { status?: string; processedAt?: string; seenAt?: string }): boolean {
  if (n.status !== "processed") return false;
  if (!n.processedAt) return !n.seenAt;
  if (!n.seenAt) return true;
  return new Date(n.processedAt).getTime() > new Date(n.seenAt).getTime();
}

export function NoteList() {
  const { state, openNote } = useApp();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [theme, setTheme] = useState("all");

  const scopedNotes = useMemo(
    () => state.notes.filter((n) => inSelectedFolder(n.folderPath, state.selectedFolder)),
    [state.notes, state.selectedFolder]
  );

  const allThemes = useMemo(
    () => Array.from(new Set(scopedNotes.flatMap((n) => n.themes || []))).sort(),
    [scopedNotes]
  );

  const filtered = useMemo(() => {
    return scopedNotes.filter((n) => {
      const matchesKind = kind === "all" || (n.kind || "unknown") === kind;
      const matchesTheme = theme === "all" || (n.themes || []).includes(theme);
      const hay = `${n.title || ""} ${n.summary || ""} ${(n.themes || []).join(" ")} ${n.folderPath || ""}`.toLowerCase();
      const matchesQuery = !query.trim() || hay.includes(query.toLowerCase());
      return matchesKind && matchesTheme && matchesQuery;
    });
  }, [scopedNotes, kind, theme, query]);

  if (state.notes.length === 0) {
    return <div className="empty">No notes yet. Capture something!</div>;
  }

  return (
    <>
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
            {isReadyToRead(n) && <span className="ready-pill">Ready to read</span>}
            {n.folderPath && <div className="note-path">{n.folderPath}</div>}
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
    </>
  );
}
