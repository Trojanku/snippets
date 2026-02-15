# Snippets

```
    _____
   / o o \
  |   ^   |
   \_____/
  /|     |\
 / |     | \
```

A note-taking app with claws. Capture thoughts, and let AI pinch out the good bits — themes, connections, and actionable tasks — so nothing slips through.

## What It Does

You scribble. Snippets scuttles.

- **Capture** notes through a simple web UI
- **AI processing** enriches notes with titles, summaries, and themes
- **Knowledge graph** connects related notes automatically
- **Mission tracking** extracts actionable tasks into `MISSION.md`
- **Memory** distills patterns and insights into `MEMORY.md`
- **Real-time sync** via SSE — everything updates as it happens

## Tech Stack

**Backend:** Express + TypeScript, file-based markdown storage with YAML frontmatter, Chokidar for file watching

**Frontend:** React 19 + Vite, rendered markdown, SSE for live updates

**AI:** OpenClaw skill for note analysis and connection mapping

## Getting Started

```bash
npm install
npm run dev
```

This starts both the Express server and Vite dev server. Open the URL printed in your terminal.

## Keep it running (recommended)

For a persistent local dev service (auto-restart, survives terminal closure):

```bash
npm run service:install
npm run service:status
```

Useful commands:

```bash
npm run service:restart
journalctl --user -u snippets-dev.service -f
```

Service template lives at `ops/systemd/snippets-dev.service`.

## Project Structure

```
snippets/
├── src/
│   ├── server/     # Express API + SSE
│   └── web/        # React frontend
├── notes/          # Your notes (markdown + frontmatter)
├── .agent/         # AI-managed connections
├── MISSION.md      # Extracted tasks
└── MEMORY.md       # Distilled insights
```

## How It Works

1. Write a note in the capture view
2. It's saved as a markdown file with frontmatter metadata
3. The AI skill picks it up, enriches it with themes and a summary
4. Connections to related notes are mapped in a knowledge graph
5. Actionable items get pinched out into your mission file

All data lives locally as markdown files. No database, no cloud — just files and claws.

## License

MIT
