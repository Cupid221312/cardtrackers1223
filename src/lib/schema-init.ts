/**
 * Idempotent runtime schema bootstrap for Postgres. Called by /api/setup so
 * the user never has to run `prisma db push` from a terminal — first setup
 * call creates the tables, later calls are no-ops.
 *
 * Kept in raw SQL (with IF NOT EXISTS everywhere) instead of shelling out
 * to the Prisma CLI, because Vercel serverless functions can't spawn CLI
 * processes. The shape here must stay in sync with prisma/schema.postgres.prisma.
 */
import { prisma } from "./db";

const DDL = [
  `CREATE TABLE IF NOT EXISTS "Card" (
    "id" TEXT NOT NULL,
    "playerName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "setName" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "variant" TEXT NOT NULL DEFAULT 'Base',
    "sport" TEXT NOT NULL,
    "searchQuery" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Card_playerName_year_setName_cardNumber_variant_key"
    ON "Card"("playerName","year","setName","cardNumber","variant")`,

  `CREATE TABLE IF NOT EXISTS "Sale" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "externalId" TEXT,
    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Sale_externalId_key" ON "Sale"("externalId")`,
  `CREATE INDEX IF NOT EXISTS "Sale_cardId_grade_soldAt_idx" ON "Sale"("cardId","grade","soldAt")`,

  `CREATE TABLE IF NOT EXISTS "Listing" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "askPrice" DOUBLE PRECISION NOT NULL,
    "title" TEXT NOT NULL,
    "listedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'mock',
    "url" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT,
    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Listing_externalId_key" ON "Listing"("externalId")`,
  `CREATE INDEX IF NOT EXISTS "Listing_cardId_grade_active_idx" ON "Listing"("cardId","grade","active")`,

  // Add FKs last (each in its own DO block so re-running is safe — Postgres
  // has no CREATE CONSTRAINT IF NOT EXISTS).
  `DO $$ BEGIN
    ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cardId_fkey"
      FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
  `DO $$ BEGIN
    ALTER TABLE "Listing" ADD CONSTRAINT "Listing_cardId_fkey"
      FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
];

export async function ensureSchema(): Promise<void> {
  for (const stmt of DDL) {
    await prisma.$executeRawUnsafe(stmt);
  }
}
