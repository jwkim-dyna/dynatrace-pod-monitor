import { useEffect, useRef, useState } from 'react';

let scrollLocks = 0;
let originalOverflow = '';

export function useRetainedOverlay<T>(value: T | null) {
  const [retained, setRetained] = useState<T | null>(value);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (value) {
      setRetained(value);
      let nextFrame = 0;
      const frame = requestAnimationFrame(() => { nextFrame = requestAnimationFrame(() => setOpen(true)); });
      return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); };
    }
    setOpen(false);
    const timer = window.setTimeout(() => setRetained(null), 240);
    return () => window.clearTimeout(timer);
  }, [value]);
  return { current: value ?? retained, open };
}

export function useOverlayFocus(active: boolean, interactive: boolean, onClose: () => void) {
  const surface = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (scrollLocks++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    const frame = requestAnimationFrame(() => surface.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      if (--scrollLocks === 0) document.body.style.overflow = originalOverflow;
      requestAnimationFrame(() => { if (opener?.isConnected && !opener.closest('[inert]')) opener.focus(); });
    };
  }, [active]);
  useEffect(() => {
    if (!active || !interactive) return;
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.key !== 'Tab') return;
      const items = Array.from(surface.current?.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? []).filter(item => item.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); surface.current?.focus(); }
      else if (!surface.current?.contains(document.activeElement) || document.activeElement === surface.current) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', keyboard);
    return () => document.removeEventListener('keydown', keyboard);
  }, [active, interactive, onClose]);
  return surface;
}
