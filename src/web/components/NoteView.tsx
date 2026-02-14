import Markdown from "react-markdown";
import { useApp } from "../App.tsx";

export function NoteView() {
  const { state } = useApp();
  const note = state.activeNote;
  if (!note) return null;

  const { frontmatter: fm, content } = note;

  return (
    <div className="note-view">
      <h1>{fm.title || fm.id}</h1>
      <div className="note-meta">
        <span>{new Date(fm.created).toLocaleString()}</span>
        {fm.status && (
          <span className={`status status-${fm.status}`}>{fm.status}</span>
        )}
      </div>

      {fm.themes && fm.themes.length > 0 && (
        <div className="tags">
          {fm.themes.map((t) => (
            <span key={t} className="tag">{t}</span>
          ))}
        </div>
      )}

      {fm.summary && <blockquote className="note-summary">{fm.summary}</blockquote>}

      <div className="note-content">
        <Markdown>{content}</Markdown>
      </div>

      {fm.suggestedActions && fm.suggestedActions.length > 0 && (
        <div className="suggested-actions">
          <h3>Suggested Actions</h3>
          <div className="action-chips">
            {fm.suggestedActions.map((a, i) => (
              <span key={i} className="action-chip" data-type={a.type}>
                {a.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
