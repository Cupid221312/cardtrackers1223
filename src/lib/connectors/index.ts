import { ebayConnector } from "./ebay";
import { myslabsConnector } from "./myslabs";
import type { Connector } from "./types";

/**
 * Central registry. The refresh loop iterates whichever connectors are
 * enabled — a source can be turned off at deploy time with an env flag
 * (e.g. MYSLABS_ENABLED=false) without a code change.
 */
export const ALL_CONNECTORS: Connector[] = [ebayConnector, myslabsConnector];

export const enabledConnectors = () => ALL_CONNECTORS.filter((c) => c.enabled);

export type { Connector, ActiveItem, SoldItem, CardQuery } from "./types";
