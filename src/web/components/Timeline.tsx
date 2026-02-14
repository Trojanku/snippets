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
    return <div className="px-4.5 py-11 text-center text-4xl text-ink-soft">No notes yet.</div>;
  }

  return (
    <section className="surface flex flex-col gap-6.5">
      {sortedThemes.map((theme) => (
        <section key={theme} className="flex flex-col gap-1.5">
          <h2 className="border-b border-line-strong pb-2 font-serif text-6xl font-semibold">{theme}</h2>
          {grouped.get(theme)!.map((n) => (
            <button
              key={n.id}
              className="note-row border-0 bg-transparent"
              onClick={() => openNote(n.id)}
            >
              <div className="font-serif text-5.5 font-semibold leading-tight">{n.title || n.id}</div>
              <div className="text-xs uppercase tracking-widest text-ink-soft">
                {new Date(n.created).toLocaleDateString()}
              </div>
              {n.summary && <div className="text-sm leading-1.75 text-ink-soft">{n.summary}</div>}
            </button>
          ))}
        </section>
      ))}
    </section>
  );
}
