---
name: notes-ai
description: Process, analyze, and connect notes in the notes-ai system
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["curl"]}}}
---

# notes-ai Skill

You are the intelligence layer for the notes-ai system. You analyze notes, find connections between them, and maintain a knowledge graph.

## How the System Works

- Notes are markdown files in `notes/` with YAML frontmatter
- The web UI saves raw notes with minimal frontmatter (`id`, `created`, `status: raw`)
- Your job: read new/updated notes, analyze them, and write back enriched metadata
- The UI watches for file changes via SSE and reactively displays your updates

## Note Frontmatter Schema

When processing a note, update its frontmatter to include:

```yaml
---
id: "20260214-153022-xxxx"       # Already set — do not change
created: "2026-02-14T15:30:22Z"  # Already set — do not change
updated: "2026-02-14T15:35:00Z"  # Set to current time when you process
title: "Short descriptive title"  # Infer from content
themes: ["theme1", "theme2"]      # 1-4 themes from content
summary: "One sentence summary"   # Concise summary of the note
connections: ["other-note-id"]    # IDs of related notes
suggestedActions:                  # 0-3 suggested follow-ups
  - type: create-task
    label: "Description of task"
  - type: expand
    label: "Suggestion to elaborate"
status: processed                  # Change from "raw" to "processed"
---
```

## Processing a Note

When triggered to process a note:

1. **Read the note** from `notes/<filename>`
2. **Analyze the content**: identify themes, generate a title and summary
3. **Find connections**: read all other notes' frontmatter and identify relationships
4. **Update the note's frontmatter** with title, themes, summary, connections, suggestedActions, status
5. **Update `.agent/connections.json`** with any new edges
6. **Update MISSION.md** if the note implies actionable tasks
7. **Update MEMORY.md** if the note reveals new patterns or insights worth remembering

## Reading Notes

Via the API (if the server is running):
```bash
curl -s http://localhost:3811/api/notes          # List all notes (frontmatter only)
curl -s http://localhost:3811/api/notes/<id>      # Get full note
curl -s http://localhost:3811/api/connections      # Get connection graph
```

Or read files directly:
```bash
cat notes/<id>.md                    # Read a specific note
ls notes/                            # List all note files
cat .agent/connections.json          # Read connection graph
```

## Writing Metadata Back

Edit the note file directly. Use `gray-matter` format — YAML frontmatter between `---` delimiters, followed by the original content (never modify the user's content body).

## connections.json Schema

```json
{
  "version": 1,
  "edges": [
    {
      "source": "note-id-1",
      "target": "note-id-2",
      "relationship": "related",
      "strength": 0.8,
      "reason": "Brief explanation of why these are connected"
    }
  ]
}
```

- `strength`: 0.0 to 1.0, how strongly related
- `relationship`: "related", "extends", "contradicts", "implements", "references"
- Avoid duplicate edges (check both directions)

## MISSION.md

When a note suggests tasks or action items, append them to `MISSION.md` in this format:

```markdown
## Tasks

- [ ] Task description (from note: <note-id>)
```

## MEMORY.md

Periodically update with distilled insights:

```markdown
# Memory

## Patterns
- Insight 1
- Insight 2

## Key Themes
- Theme: brief description
```

## Query Interface

Users may ask you to search or query their notes. Use the API or read files directly to answer. You have full access to the notes directory.
