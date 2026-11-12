// Finds pg_dump / pg_restore: PG_BIN env → PATH → standard Windows install folders → Docker (compose service "db").
import { existsSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export function findTool(name) {
  const exe = process.platform === "win32" ? `${name}.exe` : name;
  if (process.env.PG_BIN && existsSync(path.join(process.env.PG_BIN, exe))) return { cmd: path.join(process.env.PG_BIN, exe) };
  const probe = spawnSync(exe, ["--version"], { encoding: "utf8" });
  if (probe.status === 0) return { cmd: exe };
  if (process.platform === "win32") {
    const base = "C:\\Program Files\\PostgreSQL";
    if (existsSync(base)) {
      const versions = readdirSync(base).sort((a, b) => Number(b) - Number(a));
      for (const v of versions) {
        const p = path.join(base, v, "bin", exe);
        if (existsSync(p)) return { cmd: p };
      }
    }
  }
  const docker = spawnSync("docker", ["compose", "ps", "--status", "running", "--services"], { encoding: "utf8" });
  if (docker.status === 0 && docker.stdout.split(/\s+/).includes("db")) return { docker: true, cmd: name };
  return null;
}

export function dbParts(url) {
  const u = new URL(url);
  return { user: decodeURIComponent(u.username || "postgres"), password: decodeURIComponent(u.password || ""), host: u.hostname, port: u.port || "5432", db: u.pathname.slice(1) };
}
