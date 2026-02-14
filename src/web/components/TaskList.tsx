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
      <div className="text-ink-soft text-center py-11 px-4.5 text-4xl">
        No actionable notes yet.
        <div className="text-ink-soft text-sm">Capture notes naturally — tasks appear only when intent is explicit.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 py-4.5 px-1.5 bg-transparent border-0 border-b border-b-line/50">
        <div className="font-serif font-semibold text-5.5 leading-tight">Action Agenda</div>
        <div className="text-xs tracking-widest uppercase text-ink-soft">{taskNotes.length} actionable notes</div>
      </div>

      {taskNotes.map((n) => (
        <button key={n.id} className="flex flex-col gap-2 py-4.5 px-1.5 bg-transparent border-0 border-b border-b-line/50 cursor-pointer text-left w-full font-inherit text-inherit text-ink rounded-none transition-colors duration-120 hover:bg-white/46" onClick={() => void openNote(n.id)}>
          <div className="font-serif font-semibold text-5 leading-tight">{n.title || n.id}</div>
          {n.summary && <div className="text-4xl leading-tight text-gray-700">{n.summary}</div>}
          {n.folderPath && <div className="text-xs tracking-widest uppercase text-ink-soft">{n.folderPath}</div>}
          <div className="flex gap-2 items-center flex-wrap">
            <span className={`text-xs rounded-full px-2 py-0.5 tracking-widest uppercase border badge badge-actionability action-${n.actionability || "none"}`}>
              {n.actionability === "clear" ? "✓ Clear" : n.actionability === "maybe" ? "? Maybe" : "— None"}
            </span>
            <span className={`text-xs tracking-widest uppercase px-2 py-0.5 rounded-full border status status-${n.status || "raw"}`}>{n.status || "raw"}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
