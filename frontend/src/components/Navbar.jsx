import { Link, NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import BrandWordmark from './BrandWordmark';

const linkClass = ({ isActive }) =>
  `rounded-full px-3 py-2 text-sm font-medium transition md:px-4 ${
    isActive
      ? 'bg-binokio-accent/20 text-binokio-accent'
      : 'text-white/70 hover:text-white'
  }`;

export default function Navbar () {
  const { user } = useAuth();
  const navigate = useNavigate();

  async function handleLogout () {
    await supabase.auth.signOut();
    navigate('/');
  }

  if (!user) {
    return (
      <header className="border-b border-white/10 bg-black/25 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <BrandWordmark to="/" className="text-lg sm:text-xl" />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/about"
              className="hidden rounded-full px-3 py-2 text-sm text-white/70 hover:text-white xs:inline"
            >
              About
            </Link>
            <Link
              to="/login"
              className="rounded-full px-3 py-2 text-sm text-white/80 hover:text-white sm:px-4"
            >
              Log in
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-binokio-accent px-3 py-2 text-sm font-semibold text-white shadow-lg shadow-binokio-accent/30 sm:px-4"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-black/40 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:px-4 sm:py-3">
        <BrandWordmark to="/dashboard" className="text-lg sm:text-xl" />
        {/* Desktop / large tablet: full nav in header */}
        <nav className="hidden flex-wrap items-center justify-center gap-1 lg:flex">
          <NavLink to="/dashboard" className={linkClass}>
            Home
          </NavLink>
          <NavLink to="/browse" className={linkClass}>
            Discover
          </NavLink>
          <NavLink to="/matches" className={linkClass}>
            Matches
          </NavLink>
          <NavLink to="/profile" className={linkClass}>
            Profile
          </NavLink>
        </nav>
        <button
          type="button"
          onClick={handleLogout}
          className="shrink-0 rounded-full border border-white/20 px-3 py-2 text-xs text-white/80 hover:border-binokio-accent/50 hover:text-white sm:text-sm md:px-4"
        >
          <span className="hidden sm:inline">Log out</span>
          <span className="sm:hidden" aria-hidden>
            ⎋
          </span>
        </button>
      </div>
    </header>
  );
}
