---
name: snippets-ai
description: Process, analyze, and connect notes in the Snippets note-taking app. Use when asked to process notes, check pending notes, or work with the Snippets system. Triggers on "process notes", "check snippets", "snippets queue".
user-invocable: true
metadata: {"openclaw":{"requires":{"bins":["curl"]}}}
---

# snippets-ai Skill

You are the intelligence layer for Snippets.

## Core rule: classify before acting

Every note must be classified:
- `kind`: `knowledge | action | idea | journal | reference`
- `actionability`: `none | maybe | clear`
- `classificationConfidence`: `0.0..1.0`

Default to **conservative** behavior:
- If unclear, use `kind: knowledge`, `actionability: none`
- Do **not** create tasks unless intent is explicit

## Folder routing is required

Snippets is folder-first. Route each processed note into a canonical folder:
- `knowledge/*` for factual/product context
- `actions/*` for clear actionable commitments
- `ideas/*` for exploratory concepts
- `journal/*` for personal/reflection/log style notes
- `reference/*` for docs/resources/snippets used as lookup

Use `folderPath` in frontmatter and move the file with API:

```bash
curl -s -X POST http://localhost:3811/api/notes/<id>/move \
  -H 'Content-Type: application/json' \
  -d '{"folderPath":"knowledge/openclaw"}'
```

## Task extraction guardrails

Create actionable suggestions only when explicit intent exists, e.g.:
- "TODO"
- "I need to..."
- deadline/commitment language ("by Friday", "must", "ship")

Informational/product notes (like product positioning, architecture descriptions) are usually `knowledge`, not tasks.

## Processing queue workflow

Use queue endpoints (server runs on `http://localhost:3811`):

```bash
curl -s http://localhost:3811/api/pending
curl -s -X POST http://localhost:3811/api/pending/<id>/start
curl -s http://localhost:3811/api/notes/<id>
curl -s -X DELETE http://localhost:3811/api/pending/<id>
```

For each pending note ID:
1. `POST /api/pending/<id>/start` (sets `status: processing`)
2. Read note with `GET /api/notes/<id>`
3. Analyze content (new notes or edited notes)
4. Classify + choose destination folderPath
5. Enrich frontmatter (title, summary, themes, kind, actionability)
6. Move note to folder (`POST /api/notes/<id>/move`)
7. Update graph connections
8. `DELETE /api/pending/<id>` (sets `status: processed` + removes queue entry)

## Creating new notes (from actions)

When an action generates a **new note** (not processing an existing one):
- Save to: `/home/krab/projects/snippets/notes/<folderPath>/`
- Use filename: `YYYY-MM-DD-HHMMSS-<slug>.md`
- Include full frontmatter (id, created, updated, kind, etc.)
- Keep `folderPath` in sync with the actual file location
- **Do NOT save to `/home/krab/clawd/notes/`**

Example:
```bash
echo "---
id: 20260215-053031-bucket-list
created: 2026-02-15T05:30:31Z
updated: 2026-02-15T05:30:31Z
folderPath: ideas
kind: idea
status: processed
---

# Content here" > /home/krab/projects/snippets/notes/ideas/2026-02-15-053031-bucket-list.md
```

**Note on edited notes:** When a user edits a note and saves, it's automatically re-queued with `status: queued`. Re-process it normally — you may detect changes in categorization, themes, or actionability. The graph will be updated with any new connections.

## Frontmatter schema

When processing, include:

```yaml
id: "..."
created: "..."
updated: "..."
status: processed
folderPath: "knowledge/openclaw"
kind: knowledge
actionability: none
classificationConfidence: 0.92
title: "..."
themes: ["...", "..."]
summary: "..."
connections: ["..."]
suggestedActions:
  - type: "summarize"
    label: "Write a one-liner summary for the README"
    assignee: "agent"
    priority: "high"
  - type: "create-task"
    label: "Follow up with team on budget review"
    assignee: "user"
    priority: "medium"
```

### Suggested Actions Best Practices

**For agent actions** (assignee: "agent") — PREFER THESE:
- You (the AI) can implement or research these yourself
- **Examples:**
  - "Implement dark mode toggle in UI"
  - "Find tea shops in Brisbane with ratings"
  - "Write a summary of this concept"
  - "Generate a blog post outline"
  - "Research best practices for X"
  - "Refactor this code section"
  - "Create documentation page"
- If it's computational, informational, or code-related → **agent**

**For user actions** (assignee: "user") — ONLY when necessary:
- Physical tasks user must do: "Buy groceries", "Visit location"
- Personal decisions only they can make: "Schedule meeting", "Choose theme"
- Requires user permissions/accounts: "Post to your Twitter", "Access your email"
- Needs human judgment in their context: "Review and approve this design"
- **Avoid:** Don't default to "user" just because it sounds like a task

**Conservative default:**
- Only create actions when intent is *explicit*
- Ambiguous notes → empty `suggestedActions`
- Default to **agent** if the task is doable programmatically/informationally
- Better to over-assign to agent than under-utilize them

Keep the note body unchanged.

## Connections graph

Update `.agent/connections.json` with useful links:
- avoid duplicates
- include relationship + strength + short reason
- prefer high-signal edges only

## Mission / memory behavior

- Update `MISSION.md` only for clearly actionable items
- Update `MEMORY.md` only for durable patterns/insights
