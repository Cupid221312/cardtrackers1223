/**
 * Common shape every marketplace connector must implement.
 *
 * Adding a new source (COMC, PWCC, Alt, TCGPlayer, PokemonTCG, etc.) is
 * a matter of writing a module that implements this interface and
 * registering it in `./index.ts` — the refresh scheduler picks it up
 * automatically with the same timeout, size-cap, and error-isolation
 * guarantees that Step 1 gave the eBay connector.
 */

export interface SoldItem {
  externalId: string;
  title: string;
  price: number;
  soldAt: Date;
  url: string;
}

export interface ActiveItem {
  externalId: string;
  title: string;
  price: number;
  url: string;
}

export interface CardQuery {
  playerName: string;
  year: number;
  setName: string;
  cardNumber: string;
  variant: string;
  grade: string;
  /** Optional per-card override to hand a hand-crafted query to the source. */
  overrideQuery?: string;
}

export interface Connector {
  /** Short slug written to Sale.source / Listing.source. */
  readonly source: string;
  /** Whether the connector is turned on (env-flag driven). */
  readonly enabled: boolean;
  /**
   * Whether the source actually exposes sold-comp history. Sources that don't
   * (e.g. MySlabs) must NOT be called at all — a no-op empty return would
   * be counted as a success by the circuit breaker and mask real failures
   * from other operations on the same source.
   */
  readonly supportsSolds: boolean;
  readonly supportsActives: boolean;
  fetchSolds(q: CardQuery): Promise<SoldItem[]>;
  fetchActives(q: CardQuery): Promise<ActiveItem[]>;
}
