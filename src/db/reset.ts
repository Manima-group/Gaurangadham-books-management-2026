import "dotenv/config";
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!);
  await sql.unsafe("drop schema public cascade; create schema public;");
  await sql.end();
  console.log("Database cleared.");
}
main();
