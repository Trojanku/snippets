import { useEffect, useMemo, useRef, useState } from "react";
import type { NotesTreeFolderNode, NotesTreeNode } from "../lib/api.ts";
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

interface ContextMenuState {
  kind: "folder" | "note";
  path?: string;
  noteId?: string;
  noteTitle?: string;
  protected?: boolean;
  x: number;
  y: number;
}

function collectFolderPaths(nodes: NotesTreeNode[], out: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    if (node.type !== "folder") continue;
    out.add(node.path);
    collectFolderPaths(node.children, out);
  }
  return out;
}

export function Sidebar() {
  const { state, setSelectedFolder, refresh, openNote, dispatch } = useApp();
  const { notes, tree, selectedFolder, activeNote } = state;
  const [removingFolder, setRemovingFolder] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const sidebarRef = useRef<HTMLElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

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

  const treeNodes = useMemo<NotesTreeNode[]>(() => {
    if (!tree) return [];
    return tree.type === "folder" && (tree.path === "" || tree.name.toLowerCase() === "notes")
      ? tree.children
      : [tree];
  }, [tree]);

  useEffect(() => {
    const validPaths = collectFolderPaths(treeNodes);
    setExpandedFolders((prev) => {
      const next = new Set<string>();
      for (const p of prev) {
        if (validPaths.has(p)) next.add(p);
      }
      return next.size === prev.size ? prev : next;
    });
  }, [treeNodes]);

  useEffect(() => {
    if (!contextMenu || !contextMenuRef.current || !sidebarRef.current) return;
    const hostRect = sidebarRef.current.getBoundingClientRect();
    const rect = contextMenuRef.current.getBoundingClientRect();
    const nextX = Math.max(8, Math.min(contextMenu.x, hostRect.width - rect.width - 8));
    const nextY = Math.max(8, Math.min(contextMenu.y, hostRect.height - rect.height - 8));
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu((prev) => (prev ? { ...prev, x: nextX, y: nextY } : prev));
    }
  }, [contextMenu]);

  useEffect(() => {
    function dismiss(e?: Event) {
      const target = e?.target as Node | null;
      if (target && contextMenuRef.current?.contains(target)) {
        return;
      }
      setContextMenu(null);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") dismiss();
    }
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
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

  async function handleDeleteNote(noteId: string, noteTitle: string) {
    setContextMenu(null);
    const approved = window.confirm(`Delete note "${noteTitle}" permanently?`);
    if (!approved) return;
    await api.deleteNote(noteId);
    if (activeNote?.frontmatter.id === noteId) {
      dispatch({ type: "SET_ACTIVE_NOTE", note: null });
    }
    await refresh();
  }

  async function handleRenameNote(noteId: string) {
    setContextMenu(null);
    await openNote(noteId);
    window.setTimeout(() => {
      window.dispatchEvent(new Event("focus-note-title"));
    }, 40);
  }

  function toggleFolder(folderPath: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return next;
    });
  }

  function openFolderMenu(e: React.MouseEvent, folderPath: string) {
    e.preventDefault();
    e.stopPropagation();
    const hostRect = sidebarRef.current?.getBoundingClientRect();
    const x = hostRect ? e.clientX - hostRect.left : e.clientX;
    const y = hostRect ? e.clientY - hostRect.top : e.clientY;
    setContextMenu({
      kind: "folder",
      path: folderPath,
      protected: BUILT_IN_FOLDERS.has(folderPath),
      x,
      y,
    });
  }

  function openNoteMenu(e: React.MouseEvent, noteId: string, noteTitle: string) {
    e.preventDefault();
    e.stopPropagation();
    const hostRect = sidebarRef.current?.getBoundingClientRect();
    const x = hostRect ? e.clientX - hostRect.left : e.clientX;
    const y = hostRect ? e.clientY - hostRect.top : e.clientY;
    setContextMenu({
      kind: "note",
      noteId,
      noteTitle,
      x,
      y,
    });
  }

  function renderFolderNode(node: NotesTreeFolderNode, depth: number): React.ReactNode {
    const isExpanded = expandedFolders.has(node.path);
    const isSelected = selectedFolder === node.path;
    const count = folderCounts.get(node.path) || 0;
    const folderChildren = node.children.filter((c): c is NotesTreeFolderNode => c.type === "folder");
    const noteChildren = node.children.filter((c) => c.type === "note");
    const hasChildren = node.children.length > 0;

    return (
      <div key={node.path} className="tree-node">
        <div className="folder-row-shell" style={{ paddingLeft: `${depth * 14}px` }}>
          <button
            type="button"
            className="folder-toggle"
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleFolder(node.path);
            }}
            disabled={!hasChildren}
            aria-label={isExpanded ? `Collapse ${node.name}` : `Expand ${node.name}`}
            aria-expanded={hasChildren ? isExpanded : undefined}
          >
            {hasChildren ? (isExpanded ? "▾" : "▸") : "•"}
          </button>
          <button
            type="button"
            className={`folder-row ${isSelected ? "folder-row-active" : "folder-row-idle"}`}
            onClick={() => setSelectedFolder(node.path)}
            onContextMenu={(e) => openFolderMenu(e, node.path)}
          >
            <span className="min-w-0 flex-1 truncate text-sm">
              <span className="mr-2" aria-hidden="true">
                {node.icon || "📁"}
              </span>
              {node.name}
            </span>
            <span className={isSelected ? "tree-pill-active" : "tree-pill-idle"}>{count}</span>
          </button>
        </div>

        {isExpanded && (
          <div className="folder-children">
            {folderChildren.map((child) => renderFolderNode(child, depth + 1))}
            {noteChildren.map((note) => {
              const isActiveNote = activeNote?.frontmatter.id === note.id;
              return (
                <button
                  key={note.path}
                  type="button"
                  className={`folder-note-row ${isActiveNote ? "folder-note-row-active" : ""}`}
                  style={{ paddingLeft: `${(depth + 1) * 14 + 26}px` }}
                  onClick={() => {
                    setSelectedFolder(node.path);
                    if (note.id) void openNote(note.id);
                  }}
                  onContextMenu={(e) => {
                    if (!note.id) return;
                    openNoteMenu(e, note.id, note.title || note.id || note.name);
                  }}
                >
                  {note.title || note.id || note.name}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      ref={sidebarRef}
      className="panel panel-rail sticky top-24 flex w-full min-w-0 max-h-[calc(100vh-112px)] flex-col overflow-hidden p-3 max-[1060px]:static max-[1060px]:max-h-none"
    >
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
            <span className="min-w-0 flex-1 truncate text-sm">All notes</span>
            <span className={selectedFolder === "" ? "tree-pill-active" : "tree-pill-idle"}>
              {notes.length}
            </span>
          </button>

          {treeNodes
            .filter((node): node is NotesTreeFolderNode => node.type === "folder")
            .map((node) => renderFolderNode(node, 0))}
        </div>
      </div>

      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="folder-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.kind === "folder" && contextMenu.path && (
            <button
              type="button"
              className="folder-menu-item danger"
              disabled={contextMenu.protected || removingFolder === contextMenu.path}
              onClick={() => void handleRemoveFolder(contextMenu.path!)}
            >
              {contextMenu.protected
                ? "Built-in folder (protected)"
                : removingFolder === contextMenu.path
                  ? "Removing..."
                  : "Remove folder"}
            </button>
          )}
          {contextMenu.kind === "note" && contextMenu.noteId && (
            <>
              <button
                type="button"
                className="folder-menu-item"
                onClick={() => {
                  setContextMenu(null);
                  void openNote(contextMenu.noteId!);
                }}
              >
                Open note
              </button>
              <button
                type="button"
                className="folder-menu-item"
                onClick={() => void handleRenameNote(contextMenu.noteId!)}
              >
                Rename title
              </button>
              <button
                type="button"
                className="folder-menu-item danger"
                onClick={() =>
                  void handleDeleteNote(
                    contextMenu.noteId!,
                    contextMenu.noteTitle || contextMenu.noteId!
                  )
                }
              >
                Delete note
              </button>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
