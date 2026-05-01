import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export default function Signup () {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit (e) {
    e.preventDefault();
    setError('');
    setInfo('');

    const ageNum = Number(age);
    if (!Number.isFinite(ageNum) || ageNum < 18) {
      setError('You must be 18 or older to use BINOKIO.');
      return;
    }

    setLoading(true);
    const redirect = `${window.location.origin}/login`;
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: redirect,
        data: {
          full_name: fullName.trim()
        }
      }
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    // If email confirmation is off, we get a session immediately — save age on the profile row
    if (data.session?.user?.id) {
      await supabase
        .from('profiles')
        .update({ age: ageNum, full_name: fullName.trim() })
        .eq('id', data.session.user.id);
    }

    setInfo(
      'Check your inbox to confirm your email (if enabled in Supabase). Then log in and finish your profile.'
    );
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-white/10 bg-binokio-card/80 p-5 shadow-2xl backdrop-blur sm:p-8">
      <h1 className="font-display text-2xl font-bold">Create your account</h1>
      <p className="mt-1 text-sm text-binokio-muted">
        18+ only. We will send a confirmation link to your email.
      </p>
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-sm text-white/70" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-white/70" htmlFor="age">
            Age
          </label>
          <input
            id="age"
            type="number"
            min={18}
            required
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </div>
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
            autoComplete="new-password"
            minLength={6}
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
        {info ? (
          <p className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">
            {info}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-binokio-accent py-3 font-semibold text-white shadow-lg shadow-binokio-accent/20 disabled:opacity-50"
        >
          {loading ? 'Creating account…' : 'Sign up'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-binokio-muted">
        Already joined?{' '}
        <Link to="/login" className="text-binokio-accent hover:underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
