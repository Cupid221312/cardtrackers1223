// Run a single refresh cycle: npm run refresh
import { runRefresh } from "../src/lib/refresh";
import { prisma } from "../src/lib/db";

runRefresh()
  .then(console.log)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
