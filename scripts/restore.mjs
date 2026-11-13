// npm run db:restore -- backups/gaurangadham-2026-11-12_02-00.dump
// Replaces ALL current data with the backup. Asks you to type RESTORE first (or pass --yes).
import "dotenv/config";
import { existsSync, openSync, closeSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import readline from "node:readline/promises";
import path from "node:path";
import { findTool, dbParts } from "./pgtools.mjs";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
let file = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!file) {
  const dir = path.resolve(process.env.BACKUP_DIR || "backups");
  const list = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".dump")).sort().reverse() : [];
  console.log("Usage: npm run db:restore -- <backup file>\n\nNewest backups:\n" + (list.slice(0, 10).map((f) => "  " + path.join("backups", f)).join("\n") || "  (none yet)"));
  process.exit(1);
}
if (!existsSync(file)) { console.error(`File not found: ${file}`); process.exit(1); }
if (!process.argv.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(`This will REPLACE all current data with ${path.basename(file)}.\nType RESTORE to continue: `);
  rl.close();
  if (ans.trim() !== "RESTORE") { console.log("Cancelled."); process.exit(1); }
}
const tool = findTool("pg_restore");
if (!tool) { console.error("pg_restore was not found (see db:backup for how to set PG_BIN)."); process.exit(1); }
const p = dbParts(url);
let r;
const args = ["--clean", "--if-exists", "--no-owner", "--single-transaction"];
if (tool.docker) {
  const fd = openSync(file, "r");
  r = spawnSync("docker", ["compose", "exec", "-T", "db", "pg_restore", ...args, "-U", p.user, "-d", p.db], { stdio: [fd, "inherit", "inherit"] });
  closeSync(fd);
} else {
  r = spawnSync(tool.cmd, [...args, `--dbname=${url}`, file], { stdio: "inherit" });
}
if (r.status !== 0) { console.error("Restore FAILED — your data was not changed (it runs as one transaction)."); process.exit(1); }
console.log("✔ Restore complete. Restart the app.");
