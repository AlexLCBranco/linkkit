/**
 * Linkkit's home is the gauntlet site, which loads this deployment through
 * a rewrite. Any other address (the old linkkit-lake.vercel.app, Linkkit's
 * own Vercel previews) shows a "this app moved" notice instead of the app,
 * since its storage is a separate, un-backed-up copy. A preview of the
 * gauntlet site runs the app, for trying a change before it goes live
 * (`isPreviewAddress`). Pure: reads nothing global.
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

/** A preview of the gauntlet site (a Vercel deployment of its own project,
    `gauntlet-home`, under the owner's team), as in Boardkit. The app runs
    there, but without automatic folder backups: a preview is its own
    address with its own test maps, which must never be written into the
    folder that backs up the real ones. */
export function isPreviewAddress(hostname: string): boolean {
  return /^gauntlet-home-[a-z0-9-]+-alexlcbrancos-projects.vercel.app$/.test(hostname.toLowerCase());
}

/**
 * Where the app moved to, or null when it should run here. Never redirects
 * by itself: the notice only links, so no address can bounce to another.
 */
export function movedTo(hostname: string): string | null {
  const host = hostname.toLowerCase();
  if (host === HOME_HOST || isLocal(host) || isPreviewAddress(host)) return null;
  return HOME_URL;
}
