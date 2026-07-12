import { z } from "zod";

export const marketStatsSchema = z.object({
  marketValue: z.number(),
  trend30d: z.number(),
  volatility: z.number(),
  salesLast30d: z.number().int(),
  sampleSize: z.number().int(),
  confidence: z.number().min(0).max(1),
});

export const dealSchema = z.object({
  listingId: z.string(),
  cardId: z.string(),
  title: z.string(),
  grade: z.string(),
  sport: z.string(),
  askPrice: z.number(),
  listedAt: z.string(),
  source: z.string(),
  score: z.number().int().min(0).max(100),
  discount: z.number(),
  label: z.enum(["strong buy", "good deal", "fair", "overpriced"]),
  stats: marketStatsSchema,
});
export type Deal = z.infer<typeof dealSchema>;

export const cardSummarySchema = z.object({
  id: z.string(),
  playerName: z.string(),
  year: z.number().int(),
  setName: z.string(),
  cardNumber: z.string(),
  variant: z.string(),
  sport: z.string(),
  grades: z.array(
    z.object({
      grade: z.string(),
      stats: marketStatsSchema.nullable(),
      spark: z.array(z.object({ t: z.number(), price: z.number() })),
    })
  ),
});
export type CardSummary = z.infer<typeof cardSummarySchema>;

export const overviewSchema = z.object({
  trackedCards: z.number().int(),
  activeListings: z.number().int(),
  salesTracked: z.number().int(),
  strongBuys: z.number().int(),
  bestDeal: dealSchema.nullable(),
  mockMode: z.boolean(),
});
export type Overview = z.infer<typeof overviewSchema>;

export const dealsQuerySchema = z.object({
  minScore: z.coerce.number().int().min(0).max(100).optional(),
  sport: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
