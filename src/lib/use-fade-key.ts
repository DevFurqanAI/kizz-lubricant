import { useEffect, useRef, useState } from "react";

/**
 * Bumps a counter whenever `token` changes identity (e.g. a fetched rows
 * array getting replaced). Use the result as a React `key` on a table body
 * so its CSS enter animation replays exactly when new data lands — not on
 * every unrelated re-render.
 */
export function useContentFadeKey(token: unknown): number {
  const prev = useRef(token);
  const [tick, setTick] = useState(0);
  if (prev.current !== token) {
    prev.current = token;
    setTick((t) => t + 1);
  }
  return tick;
}

/**
 * Debounces a value for use as a React `key`, so a fade replays once state
 * settles instead of on every keystroke (e.g. typing into an amount filter).
 */
export function useSettledKey(value: string, delay = 400): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return settled;
}
