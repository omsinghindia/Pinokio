import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';

/** Horizontal match chats on Discover (same data as Matches → Chat). */
function DiscoverMessagesStrip ({ rows }) {
  if (rows.length > 0) {
    return (
      <section className="rounded-2xl border border-white/10 bg-binokio-surface/50 p-3 sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-white/90">
            Messages
          </h2>
          <Link
            to="/matches"
            className="shrink-0 text-xs font-medium text-binokio-accent hover:underline"
          >
            All matches
          </Link>
        </div>
        <p className="mb-3 text-[11px] text-binokio-muted sm:text-xs">
          Chats only with mutual matches — same as the Matches tab.
        </p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:gap-3">
          {rows.map(({ matchId, profile, lastMsg }) => (
            <Link
              key={matchId}
              to={`/chat/${matchId}`}
              className="flex w-[5.25rem] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-transparent p-2 text-center transition hover:border-white/10 hover:bg-white/5"
            >
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border border-white/10 bg-black/40 sm:h-16 sm:w-16">
                {profile?.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-lg text-white/50">
                    {profile?.full_name?.[0] || '?'}
                  </div>
                )}
              </div>
              <span className="line-clamp-2 w-full text-[10px] font-medium leading-tight text-white/90 sm:text-xs">
                {profile?.full_name || 'Chat'}
              </span>
              {lastMsg ? (
                <span className="line-clamp-2 w-full text-[9px] leading-tight text-binokio-muted sm:text-[10px]">
                  {lastMsg.body}
                </span>
              ) : (
                <span className="text-[9px] text-binokio-accent/80">Say hi →</span>
              )}
            </Link>
          ))}
        </div>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-dashed border-white/15 bg-black/20 px-3 py-4 text-center sm:px-4">
      <p className="text-sm font-medium text-white/80">No conversations yet</p>
      <p className="mt-1 text-xs leading-relaxed text-binokio-muted">
        When you and someone both like each other, a match is created and you can
        message here — open chats stay in sync with the Matches page.
      </p>
    </section>
  );
}

/**
 * Discover: swipe deck + Messages strip (match-only chats) + Message on card when matched.
 */
export default function Browse () {
  const { user } = useAuth();
  const [pool, setPool] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterCity, setFilterCity] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  /** Sidebar: chats with optional last message preview */
  const [matchChatList, setMatchChatList] = useState([]);

  const fetchMatchSidebar = useCallback(async () => {
    const { data: low, error: e1 } = await supabase
      .from('matches')
      .select('id, user_low, user_high, created_at')
      .eq('user_low', user.id);

    const { data: high, error: e2 } = await supabase
      .from('matches')
      .select('id, user_low, user_high, created_at')
      .eq('user_high', user.id);

    if (e1 || e2) {
      console.warn('BINOKIO matches sidebar:', e1?.message, e2?.message);
    }

    const all = [...(low || []), ...(high || [])];
    const partnerIds = [];
    for (const m of all) {
      const pid = m.user_low === user.id ? m.user_high : m.user_low;
      partnerIds.push(pid);
    }

    if (partnerIds.length === 0) {
      setMatchChatList([]);
      return;
    }

    const { data: profiles, error: pErr } = await supabase
      .from('profiles')
      .select('*')
      .in('id', partnerIds);

    if (pErr) {
      console.warn('BINOKIO sidebar profiles:', pErr.message);
      setMatchChatList([]);
      return;
    }

    const byId = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const rows = all
      .map((m) => {
        const pid = m.user_low === user.id ? m.user_high : m.user_low;
        return {
          matchId: m.id,
          profile: byId[pid],
          createdAt: m.created_at
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const matchIds = all.map((m) => m.id);
    const { data: msgs } = await supabase
      .from('messages')
      .select('match_id, body, created_at')
      .in('match_id', matchIds)
      .order('created_at', { ascending: false })
      .limit(400);

    const firstByMatch = {};
    for (const msg of msgs || []) {
      if (firstByMatch[msg.match_id] === undefined) {
        firstByMatch[msg.match_id] = msg;
      }
    }

    setMatchChatList(
      rows.map((r) => ({
        ...r,
        lastMsg: firstByMatch[r.matchId]
      }))
    );
  }, [user.id]);

  const loadCandidates = useCallback(async () => {
    setError('');
    setLoading(true);

    const { data: myRow, error: myErr } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (myErr) {
      setError(myErr.message);
      setLoading(false);
      return;
    }

    if (!myRow) {
      const meta = user.user_metadata || {};
      const fallbackName =
        meta.full_name ||
        (user.email ? user.email.split('@')[0] : null) ||
        'Member';
      const { error: insErr } = await supabase.from('profiles').insert({
        id: user.id,
        full_name: fallbackName
      });
      if (insErr) {
        setError(
          `Your profile row is missing and could not be created: ${insErr.message}. Try completing Profile or re-run DB schema.`
        );
        setLoading(false);
        return;
      }
    }

    const [{ data: blockedByMe, error: b1e }, { data: blockedMe, error: b2e }, { data: myLikes, error: lke }] =
      await Promise.all([
        supabase.from('blocked_users').select('blocked_id').eq('blocker_id', user.id),
        supabase.from('blocked_users').select('blocker_id').eq('blocked_id', user.id),
        supabase.from('likes').select('liked_id').eq('liker_id', user.id)
      ]);

    if (b1e || b2e || lke) {
      const msg = [b1e, b2e, lke].filter(Boolean).map((e) => e.message).join(' ');
      if (msg) {
        console.warn('BINOKIO Discover:', msg);
      }
    }

    const blocked = new Set([
      ...(blockedByMe || []).map((r) => r.blocked_id),
      ...(blockedMe || []).map((r) => r.blocker_id)
    ]);
    const swiped = new Set((myLikes || []).map((r) => r.liked_id));

    const { data: rows, error: qErr } = await supabase
      .from('profiles')
      .select('*')
      .neq('id', user.id)
      .order('created_at', { ascending: false })
      .limit(80);

    if (qErr) {
      setError(qErr.message);
      setLoading(false);
      return;
    }

    const filtered = (rows || []).filter(
      (p) => !blocked.has(p.id) && !swiped.has(p.id)
    );
    setPool(filtered);
    setIndex(0);
    setLoading(false);
  }, [user.id]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  useEffect(() => {
    fetchMatchSidebar();
  }, [fetchMatchSidebar]);

  useEffect(() => {
    setIndex(0);
  }, [filterCity, minAge, maxAge]);

  const visibleList = useMemo(() => {
    const cityQ = filterCity.trim().toLowerCase();
    const minN = minAge === '' ? null : Number(minAge);
    const maxN = maxAge === '' ? null : Number(maxAge);
    return pool.filter((p) => {
      if (cityQ && !(p.city || '').toLowerCase().includes(cityQ)) {
        return false;
      }
      if (minN != null && Number.isFinite(minN) && p.age != null && p.age < minN) {
        return false;
      }
      if (maxN != null && Number.isFinite(maxN) && p.age != null && p.age > maxN) {
        return false;
      }
      return true;
    });
  }, [pool, filterCity, minAge, maxAge]);

  const current = visibleList[index];

  async function swipe (isLike) {
    if (!current || actionLoading) return;
    setError('');
    setActionLoading(true);
    const likedId = current.id;
    const { error: insErr } = await supabase.from('likes').insert({
      liker_id: user.id,
      liked_id: likedId,
      is_like: isLike
    });
    setActionLoading(false);
    if (insErr) {
      setError(
        insErr.message +
          (insErr.message.includes('foreign key') || insErr.code === '23503'
            ? ' — make sure your account has a profile (open Profile & save once).'
            : '')
      );
      return;
    }
    if (isLike) {
      await fetchMatchSidebar();
    }
    setIndex((i) => i + 1);
  }

  async function blockUser () {
    if (!current) return;
    setError('');
    setActionLoading(true);
    const { error: be } = await supabase.from('blocked_users').insert({
      blocker_id: user.id,
      blocked_id: current.id
    });
    setActionLoading(false);
    if (be) {
      setError(be.message);
      return;
    }
    await fetchMatchSidebar();
    setIndex((i) => i + 1);
  }

  async function submitReport () {
    if (!current || !reportReason.trim()) return;
    setActionLoading(true);
    const { error: re } = await supabase.from('reports').insert({
      reporter_id: user.id,
      reported_id: current.id,
      reason: reportReason.trim()
    });
    setActionLoading(false);
    if (re) {
      setError(re.message);
      return;
    }
    setReportOpen(false);
    setReportReason('');
    setIndex((i) => i + 1);
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <DiscoverMessagesStrip rows={matchChatList} />
        <LoadingSpinner label="Finding people near you…" />
      </div>
    );
  }

  if (error && !current && pool.length === 0 && visibleList.length === 0) {
    return (
      <div className="space-y-4">
        <DiscoverMessagesStrip rows={matchChatList} />
        <div className="rounded-2xl bg-red-500/20 p-4 text-sm text-red-100 sm:p-6 sm:text-base">
          {error}
          <button
            type="button"
            onClick={loadCandidates}
            className="mt-4 block min-h-[44px] rounded-full bg-white/10 px-4 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!current) {
    const noMatches =
      visibleList.length === 0 && pool.length > 0
        ? 'No one matches your filters — try widening city or age.'
        : 'Add another account (e.g. seed Shiva Kant) or ask a friend to sign up — you need at least one other profile to discover.';

    return (
      <div className="mx-auto w-full max-w-md space-y-4 sm:max-w-lg">
        <DiscoverMessagesStrip rows={matchChatList} />
        <div className="rounded-3xl border border-white/10 bg-binokio-card/50 p-6 text-center sm:p-10">
          {error ? (
            <p className="mb-4 rounded-xl bg-red-500/20 px-3 py-2 text-sm text-red-100">
              {error}
            </p>
          ) : null}
          <p className="text-base font-medium sm:text-lg">
            {visibleList.length === 0 && pool.length > 0
              ? 'No profiles match filters'
              : 'You are all caught up'}
          </p>
          <p className="mt-2 text-sm text-binokio-muted">{noMatches}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {visibleList.length === 0 && pool.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setFilterCity('');
                  setMinAge('');
                  setMaxAge('');
                }}
                className="min-h-[48px] rounded-full border border-white/20 px-6 py-2 text-sm font-semibold"
              >
                Clear filters
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                loadCandidates();
                fetchMatchSidebar();
              }}
              className="min-h-[48px] rounded-full bg-binokio-accent px-6 py-2 text-sm font-semibold"
            >
              Refresh list
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-4 sm:space-y-6 md:max-w-lg">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold sm:text-2xl">Discover</h1>
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className="min-h-[40px] rounded-full border border-white/20 px-4 py-2 text-xs font-medium text-white/85 sm:text-sm"
        >
          {filtersOpen ? 'Hide filters' : 'Filters'}
        </button>
      </div>

      <DiscoverMessagesStrip rows={matchChatList} />

      {error ? (
        <p className="rounded-xl bg-amber-500/20 px-3 py-2 text-sm text-amber-100">
          {error}
        </p>
      ) : null}

      {filtersOpen ? (
        <div className="rounded-2xl border border-white/10 bg-binokio-surface/80 p-4 backdrop-blur sm:p-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-3">
              <span className="mb-1 block text-xs text-binokio-muted">
                City contains
              </span>
              <input
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                placeholder="e.g. Mumbai"
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-binokio-accent focus:ring-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-binokio-muted">Min age</span>
              <input
                type="number"
                min={18}
                value={minAge}
                onChange={(e) => setMinAge(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-binokio-accent focus:ring-2"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-binokio-muted">Max age</span>
              <input
                type="number"
                min={18}
                value={maxAge}
                onChange={(e) => setMaxAge(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none ring-binokio-accent focus:ring-2"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-binokio-card to-black/60 shadow-2xl sm:rounded-3xl">
        <div className="aspect-[3/4] max-h-[min(72vh,520px)] w-full sm:max-h-none">
          {current.avatar_url ? (
            <img
              src={current.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-black/40 text-5xl sm:text-6xl">
              {current.full_name?.[0]?.toUpperCase() || '?'}
            </div>
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <h2 className="font-display text-xl font-bold sm:text-2xl">
            {current.full_name || 'Member'}
            {current.age ? `, ${current.age}` : ''}
          </h2>
          {current.city ? (
            <p className="text-sm text-white/80">{current.city}</p>
          ) : null}
          {current.bio ? (
            <p className="mt-2 line-clamp-4 text-sm text-white/85 sm:line-clamp-3">
              {current.bio}
            </p>
          ) : null}
          {current.interests ? (
            <p className="mt-2 text-xs text-binokio-accent/90">{current.interests}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <div className="flex justify-center gap-4 sm:gap-8">
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => swipe(false)}
            className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/30 text-2xl active:bg-white/10 disabled:opacity-50 sm:h-14 sm:w-14"
            aria-label="Pass"
          >
            ✕
          </button>
          <button
            type="button"
            disabled={actionLoading}
            onClick={() => swipe(true)}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-binokio-accent text-2xl shadow-lg shadow-binokio-accent/40 active:brightness-110 disabled:opacity-50 sm:h-14 sm:w-14"
            aria-label="Like"
          >
            ♥
          </button>
        </div>

        <p className="max-w-sm text-center text-xs leading-relaxed text-binokio-muted">
          <span className="text-white/80">Like</span> each other to match, then use{' '}
          <strong className="text-white/90">Messages</strong> above or{' '}
          <Link to="/matches" className="text-binokio-accent underline-offset-2 hover:underline">
            Matches
          </Link>{' '}
          to chat — no DMs before a mutual match.
        </p>
      </div>

      <div className="flex justify-center gap-4 text-sm">
        <button
          type="button"
          onClick={blockUser}
          disabled={actionLoading}
          className="min-h-[44px] text-white/50 underline-offset-2 hover:text-white hover:underline"
        >
          Block
        </button>
        <button
          type="button"
          onClick={() => setReportOpen(true)}
          className="min-h-[44px] text-white/50 underline-offset-2 hover:text-white hover:underline"
        >
          Report
        </button>
      </div>

      {reportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-sm rounded-t-2xl border border-white/10 bg-binokio-card p-5 sm:rounded-2xl">
            <h3 className="font-semibold">Report user</h3>
            <textarea
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
              placeholder="Describe what happened…"
              rows={4}
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white outline-none ring-binokio-accent focus:ring-2"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReportOpen(false)}
                className="min-h-[44px] rounded-full px-4 py-2 text-sm text-white/70"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitReport}
                disabled={actionLoading}
                className="min-h-[44px] rounded-full bg-binokio-accent px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
