// npm run db:backup  → backups/gaurangadham-YYYY-MM-DD_HH-mm.dump  (compressed; restore with npm run db:restore)
// Keeps the newest BACKUP_KEEP (default 30) backups. Folder can be changed with BACKUP_DIR.
import "dotenv/config";
import { mkdirSync, readdirSync, statSync, unlinkSync, openSync, closeSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { findTool, dbParts } from "./pgtools.mjs";

// pg_dump needs a direct (non-pooled) connection on Neon.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set (check your .env)."); process.exit(1); }
const dir = path.resolve(process.env.BACKUP_DIR || "backups");
const keep = Number(process.env.BACKUP_KEEP || 30);
mkdirSync(dir, { recursive: true });

const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
  .format(new Date()).replace(", ", "_").replace(":", "-");
const file = path.join(dir, `gaurangadham-${stamp}.dump`);

const tool = findTool("pg_dump");
if (!tool) {
  console.error("pg_dump was not found. Install PostgreSQL client tools, set PG_BIN to its bin folder, or run the database with docker compose.");
  process.exit(1);
}
const p = dbParts(url);
let r;
if (tool.docker) {
  const fd = openSync(file, "w");
  r = spawnSync("docker", ["compose", "exec", "-T", "db", "pg_dump", "-U", p.user, "-Fc", p.db], { stdio: ["ignore", fd, "inherit"] });
  closeSync(fd);
} else {
  r = spawnSync(tool.cmd, ["--format=custom", "--no-owner", `--file=${file}`, `--dbname=${url}`], { stdio: "inherit" });
}
if (r.status !== 0 || statSync(file).size < 1024) {
  try { unlinkSync(file); } catch {}
  console.error("Backup FAILED — see the message above.");
  process.exit(1);
}
console.log(`✔ Backup saved: ${file} (${(statSync(file).size / 1024).toFixed(0)} KB)`);

// Retention: keep the newest N backups
const all = readdirSync(dir).filter((f) => /^gaurangadham-.*\.dump$/.test(f)).sort().reverse();
for (const old of all.slice(keep)) { unlinkSync(path.join(dir, old)); console.log(`  removed old backup ${old}`); }
