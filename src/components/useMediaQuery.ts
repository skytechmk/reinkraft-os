import { useEffect, useState } from 'react';

/** True while the media query matches. Used to tell the cockpit (three columns) from the portrait phone layout. */
export function useMediaQuery(query: string): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return matches;
}

/** Same condition as the `cockpit:` Tailwind variant in index.css. */
export const COCKPIT_QUERY = '(min-width: 1024px), (min-width: 800px) and (orientation: landscape)';
