import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const NOTES_DIR = path.resolve("notes");
const AGENT_DIR = path.resolve(".agent");
const PENDING_DIR = path.join(AGENT_DIR, "pending");
const CONNECTIONS_PATH = path.join(AGENT_DIR, "connections.json");
const MEMORY_PATH = path.resolve("MEMORY.md");
const MISSION_PATH = path.resolve("MISSION.md");

export const DEFAULT_NOTE_FOLDERS = [
  "inbox",
  "knowledge",
  "actions",
  "ideas",
  "journal",
  "reference",
] as const;

export interface NoteFrontmatter {
  id: string;
  created: string;
  updated?: string;
  title?: string;
  themes?: string[];
  summary?: string;
  connections?: string[];
  suggestedActions?: {
    type: string;
    label: string;
    assignee?: "user" | "agent";
    priority?: "low" | "medium" | "high";
    status?: "pending" | "completed" | "declined";
    result?: string;
    jobId?: string;
    jobStatus?: "running" | "completed" | "failed";
    jobStartedAt?: string;
  }[];
  status?: "raw" | "queued" | "processing" | "processed" | "failed" | string;
  kind?: "knowledge" | "action" | "idea" | "journal" | "reference" | string;
  actionability?: "none" | "maybe" | "clear" | string;
  classificationConfidence?: number;
  processingError?: string;
  folderPath?: string;
  processedAt?: string;
  seenAt?: string;
}

export interface Note {
  frontmatter: NoteFrontmatter;
  content: string;
  filePath: string; // absolute path
  folderPath: string; // relative to notes root, posix
}

export interface ConnectionEdge {
  source: string;
  target: string;
  relationship: string;
  strength: number;
  reason: string;
}

export interface ConnectionGraph {
  version: number;
  edges: ConnectionEdge[];
}

export interface NotesTreeFolderNode {
  type: "folder";
  name: string;
  path: string;
  children: NotesTreeNode[];
}

export interface NotesTreeNoteNode {
  type: "note";
  name: string;
  path: string;
  id?: string;
  title?: string;
  status?: string;
  kind?: string;
}

export type NotesTreeNode = NotesTreeFolderNode | NotesTreeNoteNode;

function toPosixPath(p: string): string {
  return p.split(path.sep).join("/");
}

function sanitizeFolderPath(folderPath?: string): string | null {
  if (!folderPath) return "";
  const trimmed = folderPath.trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return "";
  if (trimmed.includes("..")) return null;
  if (path.isAbsolute(trimmed)) return null;

  const normalized = path.posix
    .normalize(trimmed.replace(/\\/g, "/"))
    .replace(/^\/+|\/+$/g, "");

  if (!normalized || normalized.startsWith("..") || normalized.includes("../")) {
    return null;
  }

  return normalized;
}

export function ensureNoteFolders(): void {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  for (const folder of DEFAULT_NOTE_FOLDERS) {
    fs.mkdirSync(path.join(NOTES_DIR, folder), { recursive: true });
  }
}

function generateId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

function listMarkdownFilesRecursive(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listMarkdownFilesRecursive(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function parseNote(filePath: string): Note | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);

    const relDir = path.relative(NOTES_DIR, path.dirname(filePath));
    const diskFolderPath = relDir === "" ? "" : toPosixPath(relDir);
    const fm = data as NoteFrontmatter;

    const cleanedFmFolder = sanitizeFolderPath(fm.folderPath);
    const folderPath = cleanedFmFolder && cleanedFmFolder !== "" ? cleanedFmFolder : diskFolderPath;

    return {
      frontmatter: {
        ...fm,
        folderPath,
      },
      content: content.trim(),
      filePath,
      folderPath,
    };
  } catch {
    return null;
  }
}

function findNoteFileById(id: string): string | null {
  const target = `${id}.md`;
  const files = listMarkdownFilesRecursive(NOTES_DIR);
  const byName = files.find((f) => path.basename(f) === target);
  if (byName) return byName;

  for (const file of files) {
    const note = parseNote(file);
    if (note?.frontmatter.id === id) return file;
  }

  return null;
}

export function listNotes(): Note[] {
  ensureNoteFolders();
  const files = listMarkdownFilesRecursive(NOTES_DIR);
  const notes: Note[] = [];
  for (const file of files) {
    const note = parseNote(file);
    if (note) notes.push(note);
  }

  notes.sort(
    (a, b) =>
      new Date(b.frontmatter.created).getTime() -
      new Date(a.frontmatter.created).getTime()
  );

  return notes;
}

export function getNote(id: string): Note | null {
  ensureNoteFolders();
  const filePath = findNoteFileById(id);
  if (!filePath) return null;
  return parseNote(filePath);
}

export function createNote(content: string): Note {
  ensureNoteFolders();

  const id = generateId();
  const folderPath = "inbox";
  const frontmatter: NoteFrontmatter = {
    id,
    created: new Date().toISOString(),
    status: "raw",
    folderPath,
  };

  const fileContent = matter.stringify(content, frontmatter);
  const filePath = path.join(NOTES_DIR, folderPath, `${id}.md`);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, fileContent);

  return {
    frontmatter,
    content,
    filePath,
    folderPath,
  };
}

export function getConnections(): ConnectionGraph {
  try {
    return JSON.parse(fs.readFileSync(CONNECTIONS_PATH, "utf-8"));
  } catch {
    return { version: 1, edges: [] };
  }
}

export function getMemory(): string {
  try {
    return fs.readFileSync(MEMORY_PATH, "utf-8");
  } catch {
    return "";
  }
}

export function getMission(): string {
  try {
    return fs.readFileSync(MISSION_PATH, "utf-8");
  } catch {
    return "";
  }
}

export function patchNoteFrontmatter(id: string, patch: Partial<NoteFrontmatter>): Note | null {
  const note = getNote(id);
  if (!note) return null;

  const cleanPatch = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined)
  ) as Partial<NoteFrontmatter>;

  const nextFrontmatter: NoteFrontmatter = {
    ...note.frontmatter,
    ...cleanPatch,
    updated: new Date().toISOString(),
  };

  const desiredFolder = sanitizeFolderPath(
    cleanPatch.folderPath ?? nextFrontmatter.folderPath ?? note.folderPath
  );

  const finalFolder = desiredFolder ?? note.folderPath;
  nextFrontmatter.folderPath = finalFolder;

  const targetDir = finalFolder
    ? path.join(NOTES_DIR, ...finalFolder.split("/"))
    : NOTES_DIR;
  const targetFilePath = path.join(targetDir, `${id}.md`);

  fs.mkdirSync(targetDir, { recursive: true });
  const fileContent = matter.stringify(note.content, nextFrontmatter);
  fs.writeFileSync(targetFilePath, fileContent);

  if (path.resolve(targetFilePath) !== path.resolve(note.filePath) && fs.existsSync(note.filePath)) {
    fs.unlinkSync(note.filePath);
  }

  return {
    frontmatter: nextFrontmatter,
    content: note.content,
    filePath: targetFilePath,
    folderPath: finalFolder,
  };
}

export function moveNoteToFolder(id: string, folderPath: string): Note | null {
  const safe = sanitizeFolderPath(folderPath);
  if (safe === null) return null;
  return patchNoteFrontmatter(id, { folderPath: safe });
}

export function setNoteStatus(
  id: string,
  status: NoteFrontmatter["status"],
  processingError?: string
): Note | null {
  const patch: Partial<NoteFrontmatter> = { status };
  if (processingError !== undefined) patch.processingError = processingError;
  if (status === "processed") patch.processedAt = new Date().toISOString();
  return patchNoteFrontmatter(id, patch);
}

export function markNoteSeen(id: string): Note | null {
  return patchNoteFrontmatter(id, { seenAt: new Date().toISOString() });
}

export function addToPendingQueue(id: string): void {
  fs.mkdirSync(PENDING_DIR, { recursive: true });
  fs.writeFileSync(path.join(PENDING_DIR, id), "");
}

export function saveNoteContent(id: string, newContent: string): Note | null {
  const file = findNoteFileById(id);
  if (!file) {
    console.error(`[save] File not found for id: ${id}`);
    return null;
  }

  const note = parseNote(file);
  if (!note) {
    console.error(`[save] Failed to parse note at: ${file}`);
    return null;
  }

  const newFm: NoteFrontmatter = {
    ...note.frontmatter,
    updated: new Date().toISOString(),
    status: "queued",
  };

  const newRaw = matter.stringify(newContent.trim(), newFm);
  try {
    fs.writeFileSync(file, newRaw, "utf-8");
    addToPendingQueue(id);
    const updated = parseNote(file);
    if (!updated) {
      console.error(`[save] Failed to re-parse after write: ${file}`);
      return null;
    }
    return updated;
  } catch (err) {
    console.error(`[save] Error saving note ${id}:`, err);
    return null;
  }
}

function buildTree(absDir: string, relDir: string): NotesTreeFolderNode {
  const folderName = relDir === "" ? "notes" : path.basename(relDir);
  const node: NotesTreeFolderNode = {
    type: "folder",
    name: folderName,
    path: toPosixPath(relDir),
    children: [],
  };

  if (!fs.existsSync(absDir)) return node;

  const entries = fs.readdirSync(absDir, { withFileTypes: true });
  const dirs = entries.filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => e.isFile() && e.name.endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name));

  for (const dir of dirs) {
    const childRel = relDir ? path.join(relDir, dir.name) : dir.name;
    node.children.push(buildTree(path.join(absDir, dir.name), childRel));
  }

  for (const file of files) {
    const full = path.join(absDir, file.name);
    const parsed = parseNote(full);
    const relPath = relDir ? `${toPosixPath(relDir)}/${file.name}` : file.name;
    node.children.push({
      type: "note",
      name: file.name,
      path: relPath,
      id: parsed?.frontmatter.id,
      title: parsed?.frontmatter.title,
      status: parsed?.frontmatter.status,
      kind: parsed?.frontmatter.kind,
    });
  }

  return node;
}

export function getNotesTree(): NotesTreeFolderNode {
  ensureNoteFolders();
  return buildTree(NOTES_DIR, "");
}
