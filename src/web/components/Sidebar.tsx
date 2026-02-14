import { useMemo, useState } from "react";
import type { NotesTreeNode } from "../lib/api.ts";
import { useApp } from "../App.tsx";

export function Sidebar() {
  const { state, openNote, setSelectedFolder } = useApp();
  const { activeNote, connections, notes, tree, selectedFolder } = state;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true });

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

  const actionableCount = notes.filter(
    (n) => n.actionability === "clear" || n.kind === "action"
  ).length;

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      const folder = note.folderPath || "";
      // Count in exact folder
      counts.set(folder, (counts.get(folder) || 0) + 1);
      // Also count in all parent folders
      const parts = folder.split("/").filter(Boolean);
      for (let i = 0; i < parts.length; i++) {
        const parent = parts.slice(0, i).join("/");
        counts.set(parent, (counts.get(parent) || 0) + 1);
      }
    }
    return counts;
  }, [notes]);

  function toggleFolder(path: string) {
    setExpanded((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }));
  }

  function renderTreeNode(node: NotesTreeNode, depth = 0) {
    if (node.type === "folder") {
      const key = node.path;
      const isExpanded = expanded[key] ?? depth < 1;
      const count = folderCounts.get(node.path) || 0;

      return (
        <div key={`folder:${key}`} className="flex flex-col gap-1.5" style={{ paddingLeft: `${depth * 3}px` }}>
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded transition-colors duration-120 hover:bg-white/70 tree-folder-row">
            <button
              className="w-4 min-w-4 text-ink-soft text-sm p-0 border-0 bg-none cursor-pointer tree-toggle"
              onClick={() => toggleFolder(key)}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
            <button
              className={`text-sm rounded px-2 py-1.5 text-ink-soft flex-1 text-left tree-folder ${
                selectedFolder === node.path ? "bg-gray-200 text-ink font-semibold" : "hover:bg-white hover:text-ink"
              }`}
              onClick={() => setSelectedFolder(node.path)}
            >
              {node.name}
            </button>
            <span className="ml-auto text-xs tracking-wider uppercase text-ink-soft font-semibold bg-black/3 px-1.5 py-0.5 rounded tree-count">{count}</span>
          </div>

          {isExpanded && node.children.length > 0 && (
            <div className="flex flex-col gap-1">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const noteTitle = node.title || node.id || node.name;
    return (
      <div key={`note:${node.path}`} className="flex flex-col gap-1.5" style={{ paddingLeft: `${depth * 3}px` }}>
        <button className="text-sm rounded px-2 py-1.5 text-ink-soft text-left tree-note hover:bg-white/70 hover:text-ink" onClick={() => node.id && openNote(node.id)}>
          {noteTitle}
        </button>
      </div>
    );
  }

  const rootCount = state.notes.length;

  return (
    <aside className="sticky top-20 max-[1060px]:static max-[1060px]:max-h-none max-[1060px]:w-full max-[1060px]:max-w-[760px] max-[1060px]:mx-auto flex flex-col gap-4 px-5.5 py-5.5 max-h-[calc(100vh-92px)] overflow-auto border border-line rounded-lg bg-white/42 sidebar">
      <h3 className="text-xs tracking-widest uppercase text-ink-soft mb-3">📁 Folders</h3>
      <div className="flex items-center gap-1.5 px-2 py-1.5 rounded tree-folder-row">
        <button
          className={`text-sm rounded px-2 py-1.5 text-ink-soft flex-1 text-left tree-folder ${
            selectedFolder === "" ? "bg-gray-200 text-ink font-semibold" : "hover:bg-white hover:text-ink"
          }`}
          onClick={() => setSelectedFolder("")}
        >
          All notes
        </button>
        <span className="ml-auto text-xs tracking-wider uppercase text-ink-soft font-semibold bg-black/3 px-1.5 py-0.5 rounded tree-count">{rootCount}</span>
      </div>

      <div className="flex flex-col gap-2 p-3 bg-white/30 rounded border border-line/50 tree-wrap">
        {tree ? renderTreeNode(tree, 0) : <p className="text-ink-soft text-sm">Loading tree...</p>}
      </div>

      {activeNote && (
        <>
          <h3 className="text-xs tracking-widest uppercase text-ink-soft mb-3">Connections</h3>
          {relatedNotes.length === 0 ? (
            <p className="text-ink-soft text-sm">No connections yet</p>
          ) : (
            <ul className="list-none flex flex-col gap-2.75">
              {relatedNotes.map((r) => (
                <li key={r.otherId} className="flex flex-col gap-0.5 pb-2 border-b border-dashed border-line/70">
                  <button className="text-sm text-left text-ink hover:text-focus" onClick={() => void openNote(r.otherId)}>{r.otherTitle}</button>
                  <span className="text-ink-soft text-sm">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-auto pt-2 border-t border-line">
        <p className="text-ink-soft text-sm">{notes.length} notes</p>
        <p className="text-ink-soft text-sm">{actionableCount} actionable</p>
      </div>
    </aside>
  );
}
