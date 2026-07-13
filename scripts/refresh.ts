// One-shot refresh cycle: `npm run refresh`.
// Ensures Prisma disconnects even if the refresh throws, so this can be run
// safely from cron/CI without leaking connections.
import { runRefresh } from "../src/lib/refresh";
import { prisma } from "../src/lib/db";

async function main() {
  try {
    console.log(await runRefresh());
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
