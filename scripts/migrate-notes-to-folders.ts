import fs from "node:fs";
import path from "node:path";

const NOTES_DIR = path.resolve("notes");
const INBOX_DIR = path.join(NOTES_DIR, "inbox");

interface Result {
  moved: number;
  skipped: number;
  errors: number;
}

function isRootMarkdown(filePath: string): boolean {
  return path.dirname(filePath) === NOTES_DIR && filePath.endsWith(".md");
}

function listMarkdownFilesRecursive(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listMarkdownFilesRecursive(full, out);
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  const result: Result = { moved: 0, skipped: 0, errors: 0 };

  fs.mkdirSync(NOTES_DIR, { recursive: true });
  fs.mkdirSync(INBOX_DIR, { recursive: true });

  const files = listMarkdownFilesRecursive(NOTES_DIR);
  for (const file of files) {
    if (!isRootMarkdown(file)) {
      result.skipped += 1;
      continue;
    }

    const target = path.join(INBOX_DIR, path.basename(file));
    if (target === file) {
      result.skipped += 1;
      continue;
    }

    try {
      if (fs.existsSync(target)) {
        console.warn(`[skip] target exists: ${target}`);
        result.skipped += 1;
        continue;
      }

      fs.renameSync(file, target);
      console.log(`[moved] ${path.relative(process.cwd(), file)} -> ${path.relative(process.cwd(), target)}`);
      result.moved += 1;
    } catch (err) {
      console.error(`[error] moving ${file}:`, err);
      result.errors += 1;
    }
  }

  console.log("\nMigration summary:");
  console.log(`  moved:   ${result.moved}`);
  console.log(`  skipped: ${result.skipped}`);
  console.log(`  errors:  ${result.errors}`);
}

main();
