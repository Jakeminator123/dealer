// <Spinner size="sm|md|lg" label="Läser…" />: a thin turning ring in the current text colour.
// label is read by screen readers (default "Läser"); give tone with a text-* class.
import { cn } from "./cn";

const SIZE = { xs: 12, sm: 14, md: 18, lg: 28 } as const;

export function Spinner({ size = "md", label = "Läser", className }: { size?: keyof typeof SIZE; label?: string; className?: string }) {
  const px = SIZE[size];
  return (
    <svg role="status" aria-label={label} width={px} height={px} viewBox="0 0 24 24" fill="none" className={cn("shrink-0 animate-spin", className)}>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2.5" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
