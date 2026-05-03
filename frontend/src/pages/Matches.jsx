import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Matches () {
  const { user } = useAuth();
  const { socket, status: realtimeStatus } = useSocket();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlineByPartnerId, setOnlineByPartnerId] = useState({});

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

  const partnerIdsKey = useMemo(() => {
    if (rows.length === 0) return '';
    return rows
      .map(({ match }) =>
        match.user_low === user.id ? match.user_high : match.user_low
      )
      .sort()
      .join(',');
  }, [rows, user.id]);

  useEffect(() => {
    setOnlineByPartnerId({});
    if (!socket || !partnerIdsKey) return;
    const allowed = new Set(partnerIdsKey.split(',').filter(Boolean));
    function onPresence ({ userId, status }) {
      if (!userId || String(userId) === String(user.id)) return;
      if (!allowed.has(String(userId))) return;
      setOnlineByPartnerId((prev) => ({
        ...prev,
        [userId]: status === 'online'
      }));
    }
    socket.on('user:presence', onPresence);
    return () => socket.off('user:presence', onPresence);
  }, [socket, partnerIdsKey, user.id]);

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

  const pidFor = (match) =>
    match.user_low === user.id ? match.user_high : match.user_low;

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-xl font-bold sm:text-2xl">Your matches</h1>
        {realtimeStatus === 'connecting' || (socket && !socket.connected) ? (
          <p className="text-xs text-amber-300/90">Connecting chat…</p>
        ) : realtimeStatus === 'error' ? (
          <p className="text-xs text-red-300/90">Chat offline — check connection</p>
        ) : null}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {rows.map(({ match, profile }) => {
          const pid = pidFor(match);
          const isOnline = onlineByPartnerId[pid] === true;
          return (
            <li
              key={match.id}
              className="flex min-w-0 items-center gap-3 rounded-2xl border border-white/10 bg-binokio-card/50 p-3 sm:gap-4 sm:p-4"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-black/40 sm:h-16 sm:w-16">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-lg sm:text-xl">
                    {profile?.full_name?.[0] || '?'}
                  </div>
                )}
                {isOnline ? (
                  <span
                    className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-binokio-card bg-emerald-400 shadow-sm"
                    title="Online"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2 truncate font-semibold">
                  <span className="truncate">{profile?.full_name || 'Member'}</span>
                  {isOnline ? (
                    <span className="shrink-0 text-xs font-normal text-emerald-400">
                      Online
                    </span>
                  ) : null}
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
          );
        })}
      </ul>
    </div>
  );
}
