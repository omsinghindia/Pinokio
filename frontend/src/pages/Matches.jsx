import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Matches () {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: low } = await supabase
        .from('matches')
        .select('id, user_low, user_high, created_at')
        .eq('user_low', user.id);

      const { data: high } = await supabase
        .from('matches')
        .select('id, user_low, user_high, created_at')
        .eq('user_high', user.id);

      if (cancelled) return;

      const all = [...(low || []), ...(high || [])];
      const partnerIds = all.map((m) =>
        m.user_low === user.id ? m.user_high : m.user_low
      );

      if (partnerIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .in('id', partnerIds);

      if (cancelled) return;
      if (pErr) {
        setError(pErr.message);
        setLoading(false);
        return;
      }

      const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
      const merged = all.map((m) => {
        const pid = m.user_low === user.id ? m.user_high : m.user_low;
        return { match: m, profile: byId[pid] };
      });
      setRows(merged);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <p className="rounded-xl bg-red-500/20 p-4 text-red-100">{error}</p>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-3xl border border-white/10 bg-binokio-card/40 p-6 text-center sm:p-10">
        <h1 className="font-display text-2xl font-bold">No matches yet</h1>
        <p className="mt-2 text-binokio-muted">
          Keep swiping — when someone likes you back, they will appear here.
        </p>
        <Link
          to="/browse"
          className="mt-6 inline-block rounded-full bg-binokio-accent px-6 py-2 text-sm font-semibold"
        >
          Go to Discover
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold">Your matches</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {rows.map(({ match, profile }) => (
          <li
            key={match.id}
            className="flex items-center gap-4 rounded-2xl border border-white/10 bg-binokio-card/50 p-4"
          >
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-black/40">
              {profile?.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xl">
                  {profile?.full_name?.[0] || '?'}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {profile?.full_name || 'Member'}
              </p>
              <p className="text-xs text-binokio-muted">
                Matched {new Date(match.created_at).toLocaleDateString()}
              </p>
              <Link
                to={`/chat/${match.id}`}
                className="mt-2 inline-block text-sm text-binokio-accent hover:underline"
              >
                Open chat →
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
