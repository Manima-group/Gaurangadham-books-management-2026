/** Make a stock checkpoint now: `npm run db:checkpoint` (safe to run any time, e.g. nightly). */
import "dotenv/config";
import { createCheckpoint } from "@/lib/stock";

createCheckpoint()
  .then((r) => {
    console.log(r ? `Checkpoint ${r.id} saved (covers movements up to #${r.uptoMovementId}).` : "Nothing new since the last checkpoint.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
