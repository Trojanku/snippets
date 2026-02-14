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
} from "./lib/api.ts";
import { Capture } from "./components/Capture.tsx";
import { NoteList } from "./components/NoteList.tsx";
import { NoteView } from "./components/NoteView.tsx";
import { Sidebar } from "./components/Sidebar.tsx";
import { TaskList } from "./components/TaskList.tsx";

type View = "capture" | "list" | "note" | "tasks";

interface AppState {
  notes: NoteSummary[];
  activeNote: FullNote | null;
  connections: ConnectionGraph;
  memory: string;
  mission: string;
  view: View;
}

type Action =
  | { type: "SET_NOTES"; notes: NoteSummary[] }
  | { type: "SET_ACTIVE_NOTE"; note: FullNote | null }
  | { type: "SET_CONNECTIONS"; connections: ConnectionGraph }
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
  memory: "",
  mission: "",
  view: "capture",
};

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  openNote: (id: string) => void;
  refresh: () => void;
}

const AppContext = createContext<AppContextValue>(null!);
export const useApp = () => useContext(AppContext);

export function App() {
  const [state, dispatch] = useReducer(reducer, initial);

  const refresh = useCallback(() => {
    api.listNotes().then((notes) => dispatch({ type: "SET_NOTES", notes }));
    api.getConnections().then((c) => dispatch({ type: "SET_CONNECTIONS", connections: c }));
    api.getMemory().then((m) => dispatch({ type: "SET_MEMORY", content: m.content }));
    api.getMission().then((m) => dispatch({ type: "SET_MISSION", content: m.content }));
  }, []);

  const openNote = useCallback(
    (id: string) => {
      api.getNote(id).then((note) => {
        dispatch({ type: "SET_ACTIVE_NOTE", note });
        dispatch({ type: "SET_VIEW", view: "note" });
      });
    },
    []
  );

  useEffect(() => {
    refresh();
    const unsub = subscribeSSE((event) => {
      if (event === "notes-updated") {
        api.listNotes().then((notes) => dispatch({ type: "SET_NOTES", notes }));
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

  const ctx: AppContextValue = { state, dispatch, openNote, refresh };

  return (
    <AppContext value={ctx}>
      <div className="app">
        <nav className="topnav">
          <span className="logo">notes-ai</span>
          <div className="nav-links">
            <button
              className={state.view === "capture" ? "active" : ""}
              onClick={() => dispatch({ type: "SET_VIEW", view: "capture" })}
            >
              Capture
            </button>
            <button
              className={state.view === "list" ? "active" : ""}
              onClick={() => dispatch({ type: "SET_VIEW", view: "list" })}
            >
              Notes
            </button>
            <button
              className={state.view === "tasks" ? "active" : ""}
              onClick={() => dispatch({ type: "SET_VIEW", view: "tasks" })}
            >
              Tasks
            </button>
          </div>
        </nav>
        <div className="layout">
          <main className={`main-panel ${state.view === "note" ? "note-reading" : ""}`}>
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
