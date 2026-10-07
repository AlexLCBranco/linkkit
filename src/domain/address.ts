/**
 * Linkkit's home is the gauntlet site, which loads this deployment through
 * a rewrite. Any other address (the old linkkit-lake.vercel.app, a Vercel
 * preview) shows a "this app moved" notice instead of the app, since its
 * storage is a separate, un-backed-up copy. Pure: reads nothing global.
 */
export const HOME_HOST = "gauntlet-home.vercel.app";
export const HOME_URL = `https://${HOME_HOST}/linkkit/`;

/** Development addresses: the app runs normally there. */
function isLocal(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  );
}

/**
 * Where the app moved to, or null when it should run here. Never redirects
 * by itself: the notice only links, so no address can bounce to another.
 */
export function movedTo(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === HOME_HOST || isLocal(host)) return null;
  return HOME_URL;
}
