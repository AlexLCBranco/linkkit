/**
 * The small link icon on a box that holds a link: the only way to open it
 * (in a new tab, `noopener`); a click on the box still selects it. A plain
 * `<a>`, so the browser's own new-tab and copy-link handling work. Presses
 * stop here, so they never start a drag or a selection. `data-link-open`
 * marks it for the gauntlet whiteboard, which opens it from a map that is
 * only being shown (that map ignores the pointer). Boardkit's is the same.
 */
export function LinkIcon({ url, className }: { readonly url: string; readonly className?: string }) {
  return (
    <a
      className={className}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={url}
      aria-label={`Open link: ${url}`}
      data-link-open=""
      draggable={false}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </svg>
    </a>
  );
}
