import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Login () {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit (e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-binokio-card/80 p-5 shadow-2xl backdrop-blur sm:p-8">
      <h1 className="font-display text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 text-sm text-binokio-muted">
        Log in to continue your conversations.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-sm text-white/70" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/70" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </div>
        {error ? (
          <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-200">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-binokio-accent py-3 font-semibold text-white shadow-lg shadow-binokio-accent/20 disabled:opacity-50"
        >
          {loading ? 'Signing in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-binokio-muted">
        No account?{' '}
        <Link to="/signup" className="text-binokio-accent hover:underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
