import { useMemo, useState } from "react";
import type { NotesTreeNode } from "../lib/api.ts";
import { useApp } from "../App.tsx";

export function Sidebar() {
  const { state, openNote, setSelectedFolder } = useApp();
  const { activeNote, connections, notes, tree, selectedFolder } = state;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "": true, notes: true });

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

  const treeNodes = useMemo(() => {
    if (!tree) return [];
    if (tree.type === "folder") {
      const normalized = tree.name.toLowerCase();
      if (tree.path === "" || normalized === "notes") {
        return tree.children;
      }
    }
    return [tree];
  }, [tree]);

  function toggleFolder(path: string) {
    setExpanded((prev) => ({ ...prev, [path]: !(prev[path] ?? true) }));
  }

  function renderTreeNode(node: NotesTreeNode, depth = 0) {
    if (node.type === "folder") {
      const key = node.path;
      const isExpanded = expanded[key] ?? depth < 1;
      const count = folderCounts.get(node.path) || 0;
      const isSelected = selectedFolder === node.path;

      return (
        <div key={`folder:${key}`} className="space-y-1">
          <div
            className="flex items-center gap-1 rounded-lg px-1 py-1"
            style={{ paddingLeft: `${depth * 10}px` }}
          >
            <button
              className="w-5 h-5 min-w-5 rounded-md border border-transparent text-ink-soft/80 text-xs leading-none bg-transparent hover:bg-paper/60 hover:text-ink transition-colors"
              onClick={() => toggleFolder(key)}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
            <button
              className={`flex-1 text-left text-sm rounded-md px-2.5 py-1.5 border transition-colors ${
                isSelected
                  ? "bg-accent-soft/80 border-line-strong/80 text-ink"
                  : "bg-transparent border-transparent text-ink-soft hover:bg-paper/65 hover:border-line/60 hover:text-ink"
              }`}
              onClick={() => setSelectedFolder(node.path)}
            >
              {node.name}
            </button>
            <span
              className={`min-w-[1.9rem] text-center text-[11px] leading-none rounded-full px-1.5 py-1 border ${
                isSelected
                  ? "bg-accent-soft border-line-strong/80 text-ink"
                  : "bg-paper/65 border-line/70 text-ink-soft"
              }`}
            >
              {count}
            </span>
          </div>

          {isExpanded && node.children.length > 0 && (
            <div className="ml-2 border-l border-line/40 pl-2.5 space-y-1">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const noteTitle = node.title || node.id || node.name;
    return (
      <div
        key={`note:${node.path}`}
        className="flex flex-col"
        style={{ paddingLeft: `${depth * 10}px` }}
      >
        <button
          className="text-sm rounded-md px-2.5 py-1.5 text-ink-soft text-left border border-transparent hover:bg-paper/65 hover:border-line/60 hover:text-ink transition-colors"
          onClick={() => node.id && openNote(node.id)}
        >
          {noteTitle}
        </button>
      </div>
    );
  }

  const rootCount = state.notes.length;

  return (
    <aside className="sticky top-20 max-[1060px]:static max-[1060px]:max-h-none max-[1060px]:w-full max-[1060px]:max-w-[760px] max-[1060px]:mx-auto flex flex-col gap-4 p-4 max-h-[calc(100vh-92px)] overflow-auto border border-line/70 rounded-2xl bg-paper/72 backdrop-blur shadow-lg shadow-black/5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs tracking-widest uppercase text-ink-soft">🗂 Folders</h3>
      </div>

      <button
        className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-2 border transition-colors ${
          selectedFolder === ""
            ? "bg-accent-soft/80 border-line-strong/80 text-ink"
            : "bg-paper/45 border-line/60 text-ink-soft hover:bg-paper/70 hover:text-ink"
        }`}
        onClick={() => setSelectedFolder("")}
      >
        <span className="text-sm">All notes</span>
        <span
          className={`ml-auto min-w-[1.9rem] text-center text-[11px] leading-none rounded-full px-1.5 py-1 border ${
            selectedFolder === ""
              ? "bg-accent-soft border-line-strong/80 text-ink"
              : "bg-paper/70 border-line/70 text-ink-soft"
          }`}
        >
          {rootCount}
        </span>
      </button>

      <div className="flex flex-col gap-1.5 p-2 rounded-xl border border-line/60 bg-paper-deep/35">
        {treeNodes.length > 0 ? (
          treeNodes.map((node) => renderTreeNode(node, 0))
        ) : (
          <p className="text-ink-soft text-sm px-1 py-2">Loading folders…</p>
        )}
      </div>

      {activeNote && (
        <>
          <h3 className="text-xs tracking-widest uppercase text-ink-soft mb-1">Connections</h3>
          {relatedNotes.length === 0 ? (
            <p className="text-ink-soft text-sm">No connections yet</p>
          ) : (
            <ul className="list-none flex flex-col gap-2.5">
              {relatedNotes.map((r) => (
                <li
                  key={r.otherId}
                  className="flex flex-col gap-0.5 pb-2 border-b border-dashed border-line/70"
                >
                  <button
                    className="text-sm text-left text-ink hover:text-focus transition-colors"
                    onClick={() => void openNote(r.otherId)}
                  >
                    {r.otherTitle}
                  </button>
                  <span className="text-ink-soft text-sm">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="mt-auto pt-2 border-t border-line/80 text-sm text-ink-soft">
        <p>{notes.length} notes</p>
        <p>{actionableCount} actionable</p>
      </div>
    </aside>
  );
}
