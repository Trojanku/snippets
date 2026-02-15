import { useMemo, useState } from "react";
import { useApp } from "../App.tsx";
import { NoteView } from "./NoteView.tsx";

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

export function StreamView() {
  const { state, openNote, dispatch } = useApp();
  const [query, setQuery] = useState("");
  const [focusMode, setFocusMode] = useState(true);

  const recentNotes = useMemo(() => {
    const scoped = state.notes.filter((n) => inSelectedFolder(n.folderPath, state.selectedFolder));
    const q = query.trim().toLowerCase();
    const filtered = q
      ? scoped.filter((n) => {
          const hay = `${n.title || ""} ${n.summary || ""} ${(n.themes || []).join(" ")} ${n.folderPath || ""}`.toLowerCase();
          return hay.includes(q);
        })
      : scoped;
    return [...filtered]
      .sort((a, b) => +new Date(b.updated || b.created) - +new Date(a.updated || a.created))
      .slice(0, 20);
  }, [state.notes, state.selectedFolder, query]);

  return (
    <section className="stream-shell">
      <div className="stream-header">
        <p className="text-xs uppercase tracking-[0.2em] text-ink-soft">Stream</p>
        <div className="flex items-center gap-2">
          <button className="btn-muted" onClick={() => setFocusMode((prev) => !prev)}>
            {focusMode ? "Show list" : "Hide list"}
          </button>
          <button
            className="btn-muted"
            onClick={() => dispatch({ type: "SET_ACTIVE_NOTE", note: null })}
          >
            New note
          </button>
        </div>
      </div>

      <div className={`stream-grid ${focusMode ? "stream-grid-focus" : ""}`}>
        {!focusMode && (
          <aside className="stream-rail">
            <div className="mb-3">
              <p className="text-xs uppercase tracking-[0.16em] text-ink-soft">Recent notes</p>
              <input
                className="control mt-2 w-full"
                placeholder="Search stream"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
              {recentNotes.length === 0 && (
                <p className="px-2 py-3 text-sm text-ink-soft">No notes yet. Start typing to create one.</p>
              )}
              {recentNotes.map((n) => {
                const isActive = state.activeNote?.frontmatter.id === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => void openNote(n.id)}
                    className={`stream-note-row ${isActive ? "stream-note-row-active" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="truncate font-serif text-5 font-semibold text-ink">{n.title || n.id}</span>
                      <span className={`status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
                    </div>
                    {n.summary && <p className="max-h-10 overflow-hidden text-sm leading-1.5 text-ink-soft">{n.summary}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs uppercase tracking-[0.14em] text-ink-soft">
                        {new Date(n.updated || n.created).toLocaleString()}
                      </span>
                      {isReadyToRead(n) && (
                        <span className="rounded-full border border-success/40 bg-accent-soft px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-success">
                          Ready
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>
        )}

        <div className="min-w-0">
          <NoteView />
        </div>
      </div>
    </section>
  );
}
