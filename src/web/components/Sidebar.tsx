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
        <div key={`folder:${key}`} className="tree-node" style={{ paddingLeft: `${depth * 12}px` }}>
          <div className="tree-folder-row">
            <button
              className="tree-toggle"
              onClick={() => toggleFolder(key)}
              aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
            <button
              className={`tree-folder ${selectedFolder === node.path ? "active" : ""}`}
              onClick={() => setSelectedFolder(node.path)}
            >
              {node.name}
            </button>
            <span className="tree-count">{count}</span>
          </div>

          {isExpanded && node.children.length > 0 && (
            <div className="tree-children">
              {node.children.map((child) => renderTreeNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    const noteTitle = node.title || node.id || node.name;
    return (
      <div key={`note:${node.path}`} className="tree-node" style={{ paddingLeft: `${depth * 12}px` }}>
        <button className="tree-note" onClick={() => node.id && openNote(node.id)}>
          {noteTitle}
        </button>
      </div>
    );
  }

  const rootCount = state.notes.length;

  return (
    <aside className="sidebar">
      <h3>📁 Folders</h3>
      <div className="tree-folder-row">
        <button
          className={`tree-folder ${selectedFolder === "" ? "active" : ""}`}
          onClick={() => setSelectedFolder("")}
        >
          All notes
        </button>
        <span className="tree-count">{rootCount}</span>
      </div>

      <div className="tree-wrap">
        {tree ? renderTreeNode(tree, 0) : <p className="muted">Loading tree...</p>}
      </div>

      {activeNote && (
        <>
          <h3>Connections</h3>
          {relatedNotes.length === 0 ? (
            <p className="muted">No connections yet</p>
          ) : (
            <ul className="connection-list">
              {relatedNotes.map((r) => (
                <li key={r.otherId}>
                  <button onClick={() => void openNote(r.otherId)}>{r.otherTitle}</button>
                  <span className="muted">{r.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <div className="sidebar-footer">
        <p className="muted">{notes.length} notes</p>
        <p className="muted">{actionableCount} actionable</p>
      </div>
    </aside>
  );
}
