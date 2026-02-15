import { useMemo, useState, useEffect } from "react";
import type { NotesTreeNode } from "../lib/api.ts";
import { useApp } from "../App.tsx";

export function Sidebar() {
  const { state, openNote, setSelectedFolder } = useApp();
  const { notes, tree, selectedFolder } = state;
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const actionableCount = notes.filter(
    (n) => n.actionability === "clear" || n.kind === "action"
  ).length;

  const folderCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      const folder = note.folderPath || "";
      counts.set(folder, (counts.get(folder) || 0) + 1);
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

  useEffect(() => {
    if (!selectedFolder) return;
    const parts = selectedFolder.split("/").filter(Boolean);
    setExpanded((prev) => {
      const next = { ...prev };
      for (let i = 1; i <= parts.length; i++) {
        const parent = parts.slice(0, i).join("/");
        next[parent] = true;
      }
      return next;
    });
  }, [selectedFolder]);

  function selectFolder(path: string) {
    if (path) {
      const parts = path.split("/").filter(Boolean);
      setExpanded((prev) => {
        const next = { ...prev };
        for (let i = 1; i <= parts.length; i++) {
          const parent = parts.slice(0, i).join("/");
          next[parent] = true;
        }
        return next;
      });
    }
    setSelectedFolder(path);
  }

  function renderTreeNode(node: NotesTreeNode, depth = 0) {
    if (node.type === "folder") {
      const key = node.path;
      const isExpanded = expanded[key] ?? false;
      const count = folderCounts.get(node.path) || 0;
      const isSelected = selectedFolder === node.path;

      return (
        <div key={`folder:${key}`} className="tree-node">
          <div
            className={`flex cursor-pointer items-center gap-1 rounded-md transition-colors ${isSelected ? "" : "hover:bg-paper/50"}`}
            style={{ paddingLeft: `${depth * 8}px` }}
            onClick={() => {
              selectFolder(node.path);
              if (!isExpanded) toggleFolder(key);
            }}
          >
            <button
              className="tree-toggle"
              onClick={(e) => { e.stopPropagation(); toggleFolder(key); }}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
            <span className={isSelected ? "tree-folder-active" : "tree-folder-idle"}>
              <span className="mr-2" aria-hidden="true">
                {node.icon || "📁"}
              </span>
              {node.name}
            </span>
            <span className={isSelected ? "tree-pill-active" : "tree-pill-idle"}>{count}</span>
          </div>

          {isExpanded && node.children.length > 0 && (
            <div className="tree-branch">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const noteTitle = node.title || node.id || node.name;
    return (
      <div key={`note:${node.path}`} style={{ paddingLeft: `${depth * 8 + 32}px` }}>
        <button
          className="w-full rounded-md border border-transparent px-2.5 py-1.5 text-left text-sm text-ink-soft transition-colors hover:border-line/70 hover:bg-paper/65 hover:text-ink"
          onClick={() => node.id && openNote(node.id)}
        >
          {noteTitle}
        </button>
      </div>
    );
  }

  return (
    <aside className="panel sticky top-24 flex max-h-[calc(100vh-112px)] flex-col overflow-hidden p-4 max-[1060px]:static max-[1060px]:max-h-none">
      <div className="mb-3 border-b border-line/70 pb-3">
        <h3 className="text-xs uppercase tracking-widest text-ink-soft">Navigator</h3>
        <p className="text-sm text-ink-soft">Folders and related notes</p>
      </div>

      <button
        className={`mb-3 flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
          selectedFolder === ""
            ? "border-line-strong bg-accent-soft/80 text-ink"
            : "border-line/70 bg-paper/45 text-ink-soft hover:bg-paper/70 hover:text-ink"
        }`}
        onClick={() => selectFolder("")}
      >
        <span className="text-sm">All notes</span>
        <span
          className={`ml-auto min-w-[2rem] rounded-full border px-1.5 py-1 text-center text-[11px] leading-none ${
            selectedFolder === ""
              ? "border-line-strong bg-accent-soft text-ink"
              : "border-line bg-paper/70 text-ink-soft"
          }`}
        >
          {notes.length}
        </span>
      </button>

      <div className="panel-subtle min-h-0 flex-1 overflow-auto p-2">
        {treeNodes.length > 0 ? (
          treeNodes.map((node) => renderTreeNode(node, 0))
        ) : (
          <p className="px-1 py-2 text-sm text-ink-soft">Loading folders...</p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-line/70 pt-3 text-sm">
        <div className="rounded-lg border border-line/70 bg-paper/45 px-2.5 py-2">
          <p className="text-xs uppercase tracking-widest text-ink-soft">Notes</p>
          <p className="font-serif text-xl text-ink">{notes.length}</p>
        </div>
        <div className="rounded-lg border border-line/70 bg-paper/45 px-2.5 py-2">
          <p className="text-xs uppercase tracking-widest text-ink-soft">Actionable</p>
          <p className="font-serif text-xl text-ink">{actionableCount}</p>
        </div>
      </div>
    </aside>
  );
}
