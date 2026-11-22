import { readFileSync } from "node:fs";

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export function loadSnapshot(path: string): Snapshot {
  const raw = JSON.parse(readFileSync(path, "utf8")) as Snapshot;
  if (!raw || !Array.isArray(raw.protocols) || !Array.isArray(raw.watchlist)) {
    throw new Error("snapshot is missing protocols or watchlist");
  }
  if (typeof raw.as_of !== "string" || typeof raw.floor_usd !== "number") {
    throw new Error("snapshot is missing as_of or floor_usd");
  }
  return raw;
}
