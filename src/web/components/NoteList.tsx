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
    return <div className="py-11 px-4.5 text-center text-4xl text-ink-soft">No notes yet. Capture something!</div>;
  }

  return (
    <section className="panel flex flex-col p-4">
      <div className="mb-4 flex flex-wrap gap-2.5 border-b border-line/80 pb-3">
        <input
          className="control min-w-65 flex-1"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="control" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All kinds</option>
          <option value="knowledge">Knowledge</option>
          <option value="action">Action</option>
          <option value="idea">Idea</option>
          <option value="journal">Journal</option>
          <option value="reference">Reference</option>
          <option value="unknown">Unknown</option>
        </select>
        <select className="control" value={theme} onChange={(e) => setTheme(e.target.value)}>
          <option value="all">All themes</option>
          {allThemes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col">
        {filtered.map((n) => (
          <button key={n.id} className="note-row border-0 bg-transparent" onClick={() => void openNote(n.id)}>
            <div className="font-serif text-5.5 font-semibold leading-tight">{n.title || n.id}</div>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{new Date(n.created).toLocaleDateString()}</div>
            {isReadyToRead(n) && <span className="self-start rounded-full border border-success/40 bg-accent-soft px-2 py-0.5 text-[10px] uppercase tracking-widest text-success">Ready to read</span>}
            {n.folderPath && <div className="text-xs uppercase tracking-widest text-ink-soft">{n.folderPath}</div>}
            {n.summary && <div className="text-sm leading-1.75 text-ink-soft">{n.summary}</div>}
            {n.themes && n.themes.length > 0 && (
              <div className="flex flex-wrap gap-1.75">
                {n.themes.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge">{n.kind || "unknown"}</span>
              <span className={`badge action-${n.actionability || "none"}`}>
                {n.actionability === "clear" ? "✓ Clear" : n.actionability === "maybe" ? "? Maybe" : "— None"}
              </span>
              <span className={`status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
