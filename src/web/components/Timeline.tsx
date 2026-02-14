import { useApp } from "../App.tsx";

export function Timeline() {
  const { state, openNote } = useApp();

  const grouped = new Map<string, typeof state.notes>();
  for (const note of state.notes) {
    const themes = note.themes?.length ? note.themes : ["untagged"];
    for (const theme of themes) {
      if (!grouped.has(theme)) grouped.set(theme, []);
      grouped.get(theme)!.push(note);
    }
  }

  const sortedThemes = [...grouped.keys()].sort();

  if (state.notes.length === 0) {
    return <div className="text-ink-soft text-center py-11 px-4.5 text-4xl">No notes yet.</div>;
  }

  return (
    <div className="flex flex-col gap-6.5">
      {sortedThemes.map((theme) => (
        <section key={theme} className="flex flex-col gap-1.5">
          <h2 className="font-serif text-6xl font-semibold mb-2 pb-2 border-b border-line-strong">{theme}</h2>
          {grouped.get(theme)!.map((n) => (
            <button
              key={n.id}
              className="flex flex-col gap-2 py-4.5 px-1.5 bg-transparent border-0 border-b border-b-line/50 cursor-pointer text-left w-full font-inherit text-inherit text-ink rounded-none transition-colors duration-120 hover:bg-white/46 note-card"
              onClick={() => openNote(n.id)}
            >
              <div className="font-serif font-semibold text-5.5 leading-tight note-card-title">{n.title || n.id}</div>
              <div className="text-xs tracking-widest uppercase text-ink-soft note-card-date">
                {new Date(n.created).toLocaleDateString()}
              </div>
              {n.summary && <div className="text-4xl leading-tight text-gray-700 note-card-summary">{n.summary}</div>}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
