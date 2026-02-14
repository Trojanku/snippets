import { useMemo } from "react";
import { useApp } from "../App.tsx";

export function ConnectionsPanel() {
  const { state, openNote } = useApp();
  const { activeNote, connections, notes } = state;

  const relatedNotes = useMemo(() => {
    if (!activeNote) return [];
    return connections.edges
      .filter(
        (e) =>
          e.source === activeNote.frontmatter.id ||
          e.target === activeNote.frontmatter.id
      )
      .map((e) => {
        const otherId = e.source === activeNote.frontmatter.id ? e.target : e.source;
        const other = notes.find((n) => n.id === otherId);
        return { ...e, otherId, otherTitle: other?.title || otherId };
      })
      .sort((a, b) => b.strength - a.strength);
  }, [activeNote, connections.edges, notes]);

  return (
    <aside className="panel sticky top-24 flex max-h-[calc(100vh-112px)] flex-col overflow-hidden p-4 max-[1060px]:static max-[1060px]:max-h-none">
      <div className="mb-3 border-b border-line/70 pb-3">
        <h3 className="text-xs uppercase tracking-widest text-ink-soft">Connections</h3>
        <p className="text-sm text-ink-soft">Linked context for the active note</p>
      </div>

      {!activeNote ? (
        <p className="text-sm text-ink-soft">Open a note to view connected notes.</p>
      ) : relatedNotes.length === 0 ? (
        <p className="text-sm text-ink-soft">No connections yet</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 overflow-auto">
          {relatedNotes.map((r) => (
            <li key={r.otherId} className="rounded-lg border border-line/70 bg-paper/45 px-2.5 py-2">
              <button
                className="text-left text-sm text-ink transition-colors hover:text-focus"
                onClick={() => void openNote(r.otherId)}
              >
                {r.otherTitle}
              </button>
              <p className="text-sm text-ink-soft">{r.reason}</p>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
