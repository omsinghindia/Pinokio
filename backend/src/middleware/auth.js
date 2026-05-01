import { createClient } from '@supabase/supabase-js';

/**
 * Build a Supabase client that acts as the signed-in user (RLS applies).
 */
export function supabaseForUser (jwt) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
}

/**
 * Express middleware: attaches req.user (Supabase user) and req.supabase (user-scoped client).
 */
export async function requireAuth (req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Missing bearer token' });
  }

  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const admin = createClient(url, anon);
  const { data: { user }, error } = await admin.auth.getUser(token);

  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  req.user = user;
  req.accessToken = token;
  req.supabase = supabaseForUser(token);
  next();
}
