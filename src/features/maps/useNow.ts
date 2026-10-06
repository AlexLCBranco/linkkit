import { useEffect, useState } from "react";

/** The current time, refreshed every `intervalMs` (Boardkit's `useNow`), for
    the backup reminder, which must keep ageing on a page left open for days
    while nothing else re-renders it. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
