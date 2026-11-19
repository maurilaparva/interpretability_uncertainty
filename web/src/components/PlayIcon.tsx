/** The one play/stop icon for every control that animates a push (R3 Auto-play, the push demos). */
export function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg className="play-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      {playing ? <rect x="1" y="1" width="8" height="8" rx="1" fill="currentColor" /> : <path d="M2 1l7 4-7 4z" fill="currentColor" />}
    </svg>
  );
}
