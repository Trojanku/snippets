const BASE = "/api";

export interface NoteSummary {
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
    linkedNoteId?: string;
    linkedNoteTitle?: string;
  }[];
  status?: string;
  kind?: "knowledge" | "action" | "idea" | "journal" | "reference" | string;
  actionability?: "none" | "maybe" | "clear" | string;
  classificationConfidence?: number;
  processingError?: string;
  folderPath?: string;
  processedAt?: string;
  seenAt?: string;
}

export interface FullNote {
  frontmatter: NoteSummary;
  content: string;
  filePath?: string;
  folderPath?: string;
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
  icon?: string;
  children: NotesTreeNode[];
}

export interface AgentStatus {
  state: "online" | "degraded" | "offline";
  available: boolean;
  listening: boolean;
  pendingQueue: number;
  runningJobs: number;
  lastTriggerAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
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

async function json<T>(url: string): Promise<T> {
  const res = await fetch(`${BASE}${url}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export const api = {
  listNotes: () => json<NoteSummary[]>("/notes"),
  getNote: (id: string) => json<FullNote>(`/notes/${encodeURIComponent(id)}`),
  saveNote: async (id: string, content: string): Promise<FullNote | null> => {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) return null;
    return res.json();
  },
  markSeen: async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}/seen`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error || `API error: ${res.status}` };
    return body;
  },
  getTree: () => json<NotesTreeFolderNode>("/tree"),
  createNote: async (content: string): Promise<FullNote> => {
    const res = await fetch(`${BASE}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  },
  moveNote: async (id: string, folderPath: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderPath }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error || `API error: ${res.status}` };
    return { ok: true };
  },
  getConnections: () => json<ConnectionGraph>("/connections"),
  retryNote: async (id: string): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}/retry`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: body?.error || `API error: ${res.status}` };
    return body;
  },
  getMemory: () => json<{ content: string }>("/memory"),
  getMission: () => json<{ content: string }>("/mission"),
  getAgentStatus: () => json<AgentStatus>("/agent/status"),
  getUserActions: () => json("/user-actions"),
  completeAction: async (noteId: string, actionIndex: number, result?: string) => {
    const res = await fetch(`${BASE}/user-actions/${encodeURIComponent(noteId)}/${actionIndex}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ result }),
    });
    if (!res.ok) throw new Error(`Failed to complete action: ${res.status}`);
    return res.json();
  },
  declineAction: async (noteId: string, actionIndex: number) => {
    const res = await fetch(`${BASE}/user-actions/${encodeURIComponent(noteId)}/${actionIndex}/decline`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Failed to decline action: ${res.status}`);
    return res.json();
  },
  runAgentAction: async (noteId: string, actionIndex: number) => {
    const res = await fetch(`${BASE}/agent-actions/${encodeURIComponent(noteId)}/${actionIndex}/run`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Failed to run action: ${res.status}`);
    return res.json();
  },
  checkAgentActionStatus: async (noteId: string, actionIndex: number) => {
    const res = await fetch(`${BASE}/agent-actions/${encodeURIComponent(noteId)}/${actionIndex}/status`);
    if (!res.ok) throw new Error(`Failed to check action status: ${res.status}`);
    return res.json();
  },
  deleteNote: async (id: string): Promise<{ ok: boolean }> => {
    const res = await fetch(`${BASE}/notes/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
    return res.json();
  },
};

export type SSEHandler = (event: string, data: string) => void;

export function subscribeSSE(handler: SSEHandler): () => void {
  const source = new EventSource(`${BASE}/events`);
  source.onmessage = (e) => handler("message", e.data);
  for (const evt of [
    "notes-updated",
    "connections-updated",
    "memory-updated",
    "mission-updated",
  ]) {
    source.addEventListener(
      evt,
      ((e: MessageEvent) => {
        handler(evt, e.data);
      }) as EventListener
    );
  }
  return () => source.close();
}
