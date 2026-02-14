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
    return <div className="text-ink-soft text-center py-11 px-4.5 text-4xl">No notes yet. Capture something!</div>;
  }

  return (
    <>
      <div className="flex gap-2.5 mb-4 pb-2.5 border-b border-line flex-wrap">
        <input
          className="border border-line bg-white/72 rounded-2.5 px-3 py-2.25 text-sm text-ink min-w-65 flex-1 filter-input"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select className="border border-line bg-white/72 rounded-2.5 px-3 py-2.25 text-sm text-ink filter-select" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">All kinds</option>
          <option value="knowledge">Knowledge</option>
          <option value="action">Action</option>
          <option value="idea">Idea</option>
          <option value="journal">Journal</option>
          <option value="reference">Reference</option>
          <option value="unknown">Unknown</option>
        </select>
        <select className="border border-line bg-white/72 rounded-2.5 px-3 py-2.25 text-sm text-ink filter-select" value={theme} onChange={(e) => setTheme(e.target.value)}>
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
          <button key={n.id} className="flex flex-col gap-2 py-4.5 px-1.5 bg-transparent border-0 border-b border-b-line/50 cursor-pointer text-left w-full font-inherit text-inherit text-ink rounded-none transition-colors duration-120 hover:bg-white/46 note-card" onClick={() => void openNote(n.id)}>
            <div className="font-serif font-semibold text-5.5 leading-tight note-card-title">{n.title || n.id}</div>
            <div className="text-xs tracking-widest uppercase text-ink-soft note-card-date">{new Date(n.created).toLocaleDateString()}</div>
            {isReadyToRead(n) && <span className="self-start text-xs tracking-widest uppercase border border-green-600 bg-green-100 text-green-900 rounded-full px-2 py-0.5 ready-pill">Ready to read</span>}
            {n.folderPath && <div className="text-xs tracking-widest uppercase text-ink-soft note-path">{n.folderPath}</div>}
            {n.summary && <div className="text-4xl leading-tight text-gray-700 note-card-summary">{n.summary}</div>}
            {n.themes && n.themes.length > 0 && (
              <div className="flex flex-wrap gap-1.75">
                {n.themes.map((t) => (
                  <span key={t} className="text-xs px-2 py-0.5 border border-gray-300 bg-gray-100 text-gray-700 rounded-full tracking-widest uppercase text-xs tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2 items-center flex-wrap badges-row">
              <span className="text-xs rounded-full px-2 py-0.5 tracking-widest uppercase border border-gray-300 text-gray-700 bg-gray-100 badge badge-kind">{n.kind || "unknown"}</span>
              <span className={`text-xs rounded-full px-2 py-0.5 tracking-widest uppercase border badge badge-actionability action-${n.actionability || "none"}`}>
                {n.actionability === "clear" ? "✓ Clear" : n.actionability === "maybe" ? "? Maybe" : "— None"}
              </span>
              <span className={`text-xs tracking-widest uppercase px-2 py-0.5 rounded-full border status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
