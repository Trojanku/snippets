import { useMemo } from "react";
import { useApp } from "../App.tsx";

function inSelectedFolder(noteFolderPath: string | undefined, selectedFolder: string): boolean {
  const folder = noteFolderPath || "";
  if (!selectedFolder) return true;
  return folder === selectedFolder || folder.startsWith(`${selectedFolder}/`);
}

export function TaskList() {
  const { state, openNote } = useApp();

  const taskNotes = useMemo(() => {
    return state.notes.filter((n) => {
      if (!inSelectedFolder(n.folderPath, state.selectedFolder)) return false;
      const clearActionability = n.actionability === "clear";
      const hasActionItems = (n.suggestedActions || []).some((a) => a.type === "create-task");
      return clearActionability || hasActionItems || n.kind === "action";
    });
  }, [state.notes, state.selectedFolder]);

  if (taskNotes.length === 0) {
    return (
      <div className="py-11 px-4.5 text-center text-4xl text-ink-soft">
        No actionable notes yet.
        <div className="text-sm text-ink-soft">Capture notes naturally, tasks appear when intent is explicit.</div>
      </div>
    );
  }

  return (
    <section className="panel flex flex-col p-4">
      <div className="flex flex-col gap-2 border-b border-line/70 px-1.5 py-4">
        <div className="font-serif text-5.5 font-semibold leading-tight">Action agenda</div>
        <div className="text-xs uppercase tracking-widest text-ink-soft">{taskNotes.length} actionable notes</div>
      </div>

      {taskNotes.map((n) => (
        <button key={n.id} className="note-row border-0 bg-transparent" onClick={() => void openNote(n.id)}>
          <div className="font-serif text-5 font-semibold leading-tight">{n.title || n.id}</div>
          {n.summary && <div className="text-sm leading-1.75 text-ink-soft">{n.summary}</div>}
          {n.folderPath && <div className="text-xs uppercase tracking-widest text-ink-soft">{n.folderPath}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge action-${n.actionability || "none"}`}>
              {n.actionability === "clear" ? "✓ Clear" : n.actionability === "maybe" ? "? Maybe" : "— None"}
            </span>
            <span className={`status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
          </div>
        </button>
      ))}
    </section>
  );
}
