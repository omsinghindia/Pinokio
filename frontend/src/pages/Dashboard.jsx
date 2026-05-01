import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { profileCompletionPercent } from '../utils/profileCompletion';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Dashboard () {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [matchCount, setMatchCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setErr('');
      const [profRes, lowRes, highRes, likesRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('matches').select('id', { count: 'exact', head: true }).eq('user_low', user.id),
        supabase.from('matches').select('id', { count: 'exact', head: true }).eq('user_high', user.id),
        supabase.from('likes').select('id', { count: 'exact', head: true }).eq('liker_id', user.id).eq('is_like', true)
      ]);

      if (cancelled) return;
      if (profRes.error) {
        setErr(profRes.error.message);
      } else {
        setProfile(profRes.data);
      }
      const m =
        (lowRes.count || 0) +
        (highRes.count || 0);
      setMatchCount(m);
      setLikesCount(likesRes.count || 0);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  const pct = profileCompletionPercent(profile);
  const verified = !!user.email_confirmed_at;

  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">
          Hey{profile?.full_name ? `, ${profile.full_name}` : ''} 👋
        </h1>
        <p className="mt-1 text-sm text-binokio-muted sm:text-base">
          Your BINOKIO home — discover people, see matches, and chat in real time.
        </p>
      </div>

      {!verified ? (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Please verify your email address. Check your inbox for a confirmation link.
          You can still browse, but confirming keeps your account secure.
        </div>
      ) : null}

      {err ? (
        <p className="rounded-xl bg-red-500/20 px-4 py-3 text-sm text-red-100">
          {err}
        </p>
      ) : null}

      {/* Quick stats — optimized for narrow screens */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-2xl border border-white/10 bg-binokio-card/50 p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-binokio-accent sm:text-3xl">{matchCount}</p>
          <p className="text-[10px] text-binokio-muted sm:text-xs">Matches</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-binokio-card/50 p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-white sm:text-3xl">{likesCount}</p>
          <p className="text-[10px] text-binokio-muted sm:text-xs">Likes sent</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-binokio-card/50 p-3 text-center sm:p-4">
          <p className="text-2xl font-bold text-pink-300 sm:text-3xl">{pct}%</p>
          <p className="text-[10px] text-binokio-muted sm:text-xs">Profile</p>
        </div>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-card-shine bg-binokio-card/60 p-5 shadow-xl backdrop-blur sm:p-6">
          <h2 className="font-display text-lg font-semibold">Profile strength</h2>
          <p className="mt-1 text-sm text-binokio-muted">
            Complete your profile to get better matches.
          </p>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-black/40">
            <div
              className="h-full rounded-full bg-gradient-to-r from-binokio-accent to-pink-400 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <Link
            to="/profile"
            className="mt-4 inline-block min-h-[44px] rounded-full border border-white/20 px-4 py-2 text-sm leading-6 hover:border-binokio-accent/50"
          >
            Edit profile
          </Link>
        </div>

        <div className="rounded-3xl border border-white/10 bg-card-shine bg-binokio-card/60 p-5 shadow-xl backdrop-blur sm:p-6">
          <h2 className="font-display text-lg font-semibold">Quick actions</h2>
          <ul className="mt-4 space-y-3">
            <li>
              <Link
                to="/browse"
                className="flex min-h-[48px] items-center justify-between rounded-xl bg-black/25 px-4 py-3 text-sm hover:bg-black/40"
              >
                Discover people
                <span aria-hidden>→</span>
              </Link>
            </li>
            <li>
              <Link
                to="/matches"
                className="flex min-h-[48px] items-center justify-between rounded-xl bg-black/25 px-4 py-3 text-sm hover:bg-black/40"
              >
                Your matches
                <span aria-hidden>→</span>
              </Link>
            </li>
            <li>
              <Link
                to="/about"
                className="flex min-h-[48px] items-center justify-between rounded-xl bg-black/25 px-4 py-3 text-sm hover:bg-black/40"
              >
                About BINOKIO
                <span aria-hidden>→</span>
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
