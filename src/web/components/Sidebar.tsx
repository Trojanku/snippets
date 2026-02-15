import { useEffect, useMemo, useState } from "react";
import type { NotesTreeNode } from "../lib/api.ts";
import { useApp } from "../App.tsx";
import { api } from "../lib/api.ts";

const BUILT_IN_FOLDERS = new Set([
  "inbox",
  "knowledge",
  "actions",
  "ideas",
  "journal",
  "reference",
]);

interface FolderRow {
  path: string;
  name: string;
  icon: string;
  depth: number;
}

interface ContextMenuState {
  path: string;
  x: number;
  y: number;
}

function flattenFolders(nodes: NotesTreeNode[], depth = 0, out: FolderRow[] = []): FolderRow[] {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    out.push({
      path: node.path,
      name: node.name,
      icon: node.icon || "📁",
      depth,
    });
    flattenFolders(node.children, depth + 1, out);
  }
  return out;
}

export function Sidebar() {
  const { state, setSelectedFolder, refresh, openNote } = useApp();
  const { notes, tree, selectedFolder } = state;
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

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

  const folderRows = useMemo(() => {
    if (!tree) return [];
    const treeNodes =
      tree.type === "folder" && (tree.path === "" || tree.name.toLowerCase() === "notes")
        ? tree.children
        : [tree];
    return flattenFolders(treeNodes);
  }, [tree]);

  const notesInSelectedFolder = useMemo(() => {
    if (!selectedFolder) return [];
    return notes
      .filter((n) => (n.folderPath || "") === selectedFolder)
      .sort((a, b) => +new Date(b.updated || b.created) - +new Date(a.updated || a.created));
  }, [notes, selectedFolder]);

  useEffect(() => {
    function dismiss() {
      setContextMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("click", dismiss);
    window.addEventListener("contextmenu", dismiss);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("contextmenu", dismiss);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function handleRemoveFolder(folderPath: string) {
    setContextMenu(null);
    const noteCount = notes.filter((n) => {
      const folder = n.folderPath || "";
      return folder === folderPath || folder.startsWith(`${folderPath}/`);
    }).length;

    const approved = window.confirm(
      `Remove folder "${folderPath}"? ${noteCount} note(s) will be moved to inbox.`
    );
    if (!approved) return;

    setRemovingFolder(folderPath);
    try {
      const result = await api.removeFolder(folderPath);
      if (!result.ok) {
        window.alert(result.error || "Failed to remove folder");
        return;
      }
      if (selectedFolder === folderPath) {
        setSelectedFolder("");
      }
      await refresh();
    } finally {
      setRemovingFolder(null);
    }
  }

  return (
    <aside className="panel panel-rail sticky top-24 flex max-h-[calc(100vh-112px)] flex-col overflow-hidden p-3 max-[1060px]:static max-[1060px]:max-h-none">
      <div className="mb-2 border-b border-line/70 pb-2">
        <h3 className="text-xs uppercase tracking-widest text-ink-soft">Folders</h3>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className={`folder-row ${selectedFolder === "" ? "folder-row-active" : "folder-row-idle"}`}
            onClick={() => setSelectedFolder("")}
          >
            <span className="truncate text-sm">All notes</span>
            <span className={selectedFolder === "" ? "tree-pill-active" : "tree-pill-idle"}>
              {notes.length}
            </span>
          </button>

          {folderRows.map((row) => {
            const isSelected = selectedFolder === row.path;
            const count = folderCounts.get(row.path) || 0;
            const isBuiltIn = BUILT_IN_FOLDERS.has(row.path);
            return (
              <div key={row.path}>
                <button
                  type="button"
                  className={`folder-row ${isSelected ? "folder-row-active" : "folder-row-idle"}`}
                  style={{ paddingLeft: `${10 + row.depth * 14}px` }}
                  onClick={() => setSelectedFolder(row.path)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (isBuiltIn) return;
                    setContextMenu({
                      path: row.path,
                      x: e.clientX,
                      y: e.clientY,
                    });
                  }}
                >
                  <span className="truncate text-sm">
                    <span className="mr-2" aria-hidden="true">
                      {row.icon}
                    </span>
                    {row.name}
                  </span>
                  <span className={isSelected ? "tree-pill-active" : "tree-pill-idle"}>{count}</span>
                </button>

                {isSelected && notesInSelectedFolder.length > 0 && (
                  <div className="mt-1 flex flex-col gap-1 pb-1">
                    {notesInSelectedFolder.map((note) => (
                      <button
                        key={note.id}
                        type="button"
                        className="folder-note-row"
                        style={{ paddingLeft: `${26 + row.depth * 14}px` }}
                        onClick={() => void openNote(note.id)}
                      >
                        {note.title || note.id}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div
          className="folder-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="folder-menu-item danger"
            disabled={removingFolder === contextMenu.path}
            onClick={() => void handleRemoveFolder(contextMenu.path)}
          >
            {removingFolder === contextMenu.path ? "Removing..." : "Remove folder"}
          </button>
        </div>
      )}
    </aside>
  );
}
