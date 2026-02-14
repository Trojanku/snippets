import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";
import { api, subscribeSSE } from "./lib/api.ts";
import type {
  NoteSummary,
  FullNote,
  ConnectionGraph,
  NotesTreeFolderNode,
} from "./lib/api.ts";
import { Capture } from "./components/Capture.tsx";
import { NoteList } from "./components/NoteList.tsx";
import { NoteView } from "./components/NoteView.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TaskList } from "./components/TaskList.tsx";
import { ThemeToggle } from "./components/ThemeToggle.tsx";

type View = "capture" | "list" | "note" | "tasks";

interface AppState {
  notes: NoteSummary[];
  activeNote: FullNote | null;
  connections: ConnectionGraph;
  tree: NotesTreeFolderNode | null;
  selectedFolder: string; // "" means all
  memory: string;
  mission: string;
  view: View;
}

type Action =
  | { type: "SET_NOTES"; notes: NoteSummary[] }
  | { type: "SET_ACTIVE_NOTE"; note: FullNote | null }
  | { type: "SET_CONNECTIONS"; connections: ConnectionGraph }
  | { type: "SET_TREE"; tree: NotesTreeFolderNode | null }
  | { type: "SET_SELECTED_FOLDER"; folderPath: string }
  | { type: "SET_MEMORY"; content: string }
  | { type: "SET_MISSION"; content: string }
  | { type: "SET_VIEW"; view: View };

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_NOTES":
      return { ...state, notes: action.notes };
    case "SET_ACTIVE_NOTE":
      return { ...state, activeNote: action.note };
    case "SET_CONNECTIONS":
      return { ...state, connections: action.connections };
    case "SET_TREE":
      return { ...state, tree: action.tree };
    case "SET_SELECTED_FOLDER":
      return { ...state, selectedFolder: action.folderPath };
    case "SET_MEMORY":
      return { ...state, memory: action.content };
    case "SET_MISSION":
      return { ...state, mission: action.content };
    case "SET_VIEW":
      return { ...state, view: action.view };
    default:
      return state;
  }
}

const initial: AppState = {
  notes: [],
  activeNote: null,
  connections: { version: 1, edges: [] },
  tree: null,
  selectedFolder: "",
  memory: "",
  mission: "",
  view: "capture",
};

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  openNote: (id: string) => void;
  refresh: () => void;
  setSelectedFolder: (folderPath: string) => void;
}

const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);

export function App() {
  const [state, dispatch] = useReducer(reducer, initial);

  const refresh = useCallback(async () => {
    const [notes, connections, tree, memory, mission] = await Promise.all([
      api.listNotes(),
      api.getConnections(),
      api.getTree(),
      api.getMemory(),
      api.getMission(),
    ]);
    dispatch({ type: "SET_NOTES", notes });
    dispatch({ type: "SET_CONNECTIONS", connections });
    dispatch({ type: "SET_TREE", tree });
    dispatch({ type: "SET_MEMORY", content: memory.content });
    dispatch({ type: "SET_MISSION", content: mission.content });
  }, []);

  const openNote = useCallback(
    async (id: string) => {
      const note = await api.getNote(id);
      dispatch({ type: "SET_ACTIVE_NOTE", note });
      dispatch({ type: "SET_VIEW", view: "note" });

      const fm = note.frontmatter;
      if (fm.status === "processed" && !fm.seenAt) {
        await api.markSeen(id);
        const notes = await api.listNotes();
        dispatch({ type: "SET_NOTES", notes });
      }
    },
    []
  );

  const setSelectedFolder = useCallback((folderPath: string) => {
    dispatch({ type: "SET_SELECTED_FOLDER", folderPath });
  }, []);

  const readyToReadCount = state.notes.filter((n) => {
    if (n.status !== "processed") return false;
    if (!n.processedAt) return !n.seenAt;
    if (!n.seenAt) return true;
    return new Date(n.processedAt).getTime() > new Date(n.seenAt).getTime();
  }).length;

  useEffect(() => {
    refresh();
    const unsub = subscribeSSE((event) => {
      if (event === "notes-updated") {
        api.listNotes().then((notes) => dispatch({ type: "SET_NOTES", notes }));
        api.getTree().then((tree) => dispatch({ type: "SET_TREE", tree }));
        if (state.activeNote) {
          api.getNote(state.activeNote.frontmatter.id).then((note) =>
            dispatch({ type: "SET_ACTIVE_NOTE", note })
          );
        }
      } else if (event === "connections-updated") {
        api.getConnections().then((c) => dispatch({ type: "SET_CONNECTIONS", connections: c }));
      } else if (event === "memory-updated") {
        api.getMemory().then((m) => dispatch({ type: "SET_MEMORY", content: m.content }));
      } else if (event === "mission-updated") {
        api.getMission().then((m) => dispatch({ type: "SET_MISSION", content: m.content }));
      }
    });
    return unsub;
  }, []);

  const ctx: AppContextValue = { state, dispatch, openNote, refresh, setSelectedFolder };

  return (
    <AppContext value={ctx}>
      <div className="flex flex-col min-h-screen">
        <nav className="sticky top-0 z-20 flex items-center gap-5 px-7 py-3.5 bg-paper/94 border-b border-line backdrop-blur transition-colors duration-200">
          <span className="font-serif text-xl tracking-wider text-ink">notes-ai</span>
          <div className="flex gap-1.5 flex-1 nav-links">
            <button
              className={`bg-transparent border border-transparent text-ink-soft text-xs tracking-widest uppercase px-3 py-1.5 rounded-full cursor-pointer transition-colors duration-120 ${
                state.view === "capture"
                  ? "bg-accent-soft border-line text-ink"
                  : "hover:border-line hover:text-ink"
              }`}
              onClick={() => dispatch({ type: "SET_VIEW", view: "capture" })}
            >
              Capture
            </button>
            <button
              className={`bg-transparent border border-transparent text-ink-soft text-xs tracking-widest uppercase px-3 py-1.5 rounded-full cursor-pointer transition-colors duration-120 ${
                state.view === "list"
                  ? "bg-accent-soft border-line text-ink"
                  : "hover:border-line hover:text-ink"
              }`}
              onClick={() => dispatch({ type: "SET_VIEW", view: "list" })}
            >
              Notes
              {readyToReadCount > 0 && (
                <span className="ml-2 text-xs rounded-full px-1.75 py-0.5 border border-green-600 bg-green-100 text-green-900">
                  {readyToReadCount}
                </span>
              )}
            </button>
            <button
              className={`bg-transparent border border-transparent text-ink-soft text-xs tracking-widest uppercase px-3 py-1.5 rounded-full cursor-pointer transition-colors duration-120 ${
                state.view === "tasks"
                  ? "bg-accent-soft border-line text-ink"
                  : "hover:border-line hover:text-ink"
              }`}
              onClick={() => dispatch({ type: "SET_VIEW", view: "tasks" })}
            >
              Tasks
            </button>
          </div>
          <ThemeToggle />
        </nav>
        <div className="grid grid-cols-[minmax(0,1fr)_280px] max-[1060px]:grid-cols-1 gap-10 max-[1060px]:gap-[22px] flex-1 w-full max-w-[1320px] mx-auto px-6 max-[700px]:px-[14px] py-8 max-[700px]:py-5">
          <main className={`w-full mx-auto ${state.view === "note" ? "max-w-[760px]" : "max-w-[820px]"}`}>
            {state.view === "capture" && <Capture />}
            {state.view === "list" && <NoteList />}
            {state.view === "note" && state.activeNote && <NoteView />}
            {state.view === "tasks" && <TaskList />}
          </main>
          <Sidebar />
        </div>
      </div>
    </AppContext>
  );
}
