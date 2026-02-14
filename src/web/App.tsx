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
import { ConnectionsPanel } from "./components/ConnectionsPanel.tsx";

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
    dispatch({ type: "SET_VIEW", view: "list" });
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
      <div className="min-h-screen">
        <nav className="sticky top-0 z-20 border-b border-line/80 bg-paper/86 backdrop-blur-xl transition-colors duration-200">
          <div className="mx-auto flex w-full max-w-[1380px] items-center gap-4 px-6 py-4 max-[700px]:px-4 max-[700px]:py-3">
            <div className="min-w-40">
              <p className="font-serif text-xl leading-tight text-ink">notes-ai</p>
              <p className="text-[11px] uppercase tracking-[0.2em] text-ink-soft">quiet workspace</p>
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-1.5">
              <button
                className={state.view === "capture" ? "btn-accent" : "btn-muted"}
                onClick={() => dispatch({ type: "SET_VIEW", view: "capture" })}
              >
                Capture
              </button>
              <button
                className={state.view === "list" ? "btn-accent" : "btn-muted"}
                onClick={() => dispatch({ type: "SET_VIEW", view: "list" })}
              >
                Notes
                {readyToReadCount > 0 && (
                  <span className="ml-2 rounded-full border border-success/40 bg-accent-soft px-1.75 py-0.5 text-[10px] text-success">
                    {readyToReadCount}
                  </span>
                )}
              </button>
              <button
                className={state.view === "tasks" ? "btn-accent" : "btn-muted"}
                onClick={() => dispatch({ type: "SET_VIEW", view: "tasks" })}
              >
                Tasks
              </button>
            </div>
            <ThemeToggle />
          </div>
        </nav>

        <div className="mx-auto grid w-full max-w-[1520px] grid-cols-[300px_minmax(0,1fr)_300px] gap-7 px-6 py-7 max-[1240px]:grid-cols-[280px_minmax(0,1fr)] max-[1060px]:grid-cols-1 max-[1060px]:gap-5 max-[700px]:px-4 max-[700px]:py-4">
          <div className="max-[1060px]:order-2">
            <Sidebar />
          </div>

          <main className={`w-full max-[1060px]:order-1 ${state.view === "note" ? "max-w-[860px]" : "max-w-[990px]"}`}>
            {state.view === "capture" && <Capture />}
            {state.view === "list" && <NoteList />}
            {state.view === "note" && state.activeNote && <NoteView />}
            {state.view === "tasks" && <TaskList />}
          </main>

          <div className="max-[1240px]:col-start-2 max-[1240px]:row-start-2 max-[1060px]:order-3">
            <ConnectionsPanel />
          </div>
        </div>
      </div>
    </AppContext>
  );
}
