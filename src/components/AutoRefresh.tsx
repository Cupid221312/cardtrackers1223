"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetches the server-rendered dashboard every 60s so data written by the
 * 10-minute scheduler shows up without a manual reload.
 */
export function AutoRefresh({ lastSaleAt }: { lastSaleAt: string | null }) {
  const router = useRouter();
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  useEffect(() => {
    setRefreshedAt(new Date());
    const id = setInterval(() => {
      router.refresh();
      setRefreshedAt(new Date());
    }, 60_000);
    return () => clearInterval(id);
  }, [router]);

  const fmt = (d: Date) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <span className="text-xs tabular-nums" style={{ color: "var(--text-secondary)" }}>
      {lastSaleAt ? `last sale ${fmt(new Date(lastSaleAt))}` : ""}
      {refreshedAt ? ` · checked ${fmt(refreshedAt)} · auto-refreshes every minute` : ""}
    </span>
  );
}
