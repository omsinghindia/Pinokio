import { NavLink } from 'react-router-dom';

/**
 * Thumb-friendly navigation for phones and tablets (hidden on large desktops).
 */
const itemClass = ({ isActive }) =>
  `flex min-h-[3.25rem] min-w-[4rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1 text-[10px] font-semibold uppercase tracking-wide transition sm:text-xs ${
    isActive
      ? 'text-binokio-accent'
      : 'text-white/55 active:text-white'
  }`;

export default function BottomNav () {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-binokio-dark/95 px-2 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] backdrop-blur-lg lg:hidden"
      aria-label="Main navigation"
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around">
        <NavLink to="/dashboard" className={itemClass} end>
          <span className="text-lg leading-none" aria-hidden>
            ⌂
          </span>
          Home
        </NavLink>
        <NavLink to="/browse" className={itemClass}>
          <span className="text-lg leading-none" aria-hidden>
            ◎
          </span>
          Discover
        </NavLink>
        <NavLink to="/matches" className={itemClass}>
          <span className="text-lg leading-none" aria-hidden>
            ♥
          </span>
          Matches
        </NavLink>
        <NavLink to="/profile" className={itemClass}>
          <span className="text-lg leading-none" aria-hidden>
            ◉
          </span>
          Profile
        </NavLink>
      </div>
    </nav>
  );
}
