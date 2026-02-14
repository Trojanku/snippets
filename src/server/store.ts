import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

const NOTES_DIR = path.resolve("notes");
const AGENT_DIR = path.resolve(".agent");
const CONNECTIONS_PATH = path.join(AGENT_DIR, "connections.json");
const MEMORY_PATH = path.resolve("MEMORY.md");
const MISSION_PATH = path.resolve("MISSION.md");

export interface NoteFrontmatter {
  id: string;
  created: string;
  updated?: string;
  title?: string;
  themes?: string[];
  summary?: string;
  connections?: string[];
  suggestedActions?: { type: string; label: string }[];
  status?: string;
}

export interface Note {
  frontmatter: NoteFrontmatter;
  content: string;
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

function generateId(): string {
  const now = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${date}-${time}-${rand}`;
}

function parseNote(filePath: string): Note | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const { data, content } = matter(raw);
    return { frontmatter: data as NoteFrontmatter, content: content.trim() };
  } catch {
    return null;
  }
}

export function listNotes(): Note[] {
  if (!fs.existsSync(NOTES_DIR)) return [];
  const files = fs.readdirSync(NOTES_DIR).filter((f) => f.endsWith(".md"));
  const notes: Note[] = [];
  for (const file of files) {
    const note = parseNote(path.join(NOTES_DIR, file));
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
  const filePath = path.join(NOTES_DIR, `${id}.md`);
  return parseNote(filePath);
}

export function createNote(content: string): Note {
  const id = generateId();
  const frontmatter: NoteFrontmatter = {
    id,
    created: new Date().toISOString(),
    status: "raw",
  };
  const fileContent = matter.stringify(content, frontmatter);
  fs.writeFileSync(path.join(NOTES_DIR, `${id}.md`), fileContent);
  return { frontmatter, content };
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
