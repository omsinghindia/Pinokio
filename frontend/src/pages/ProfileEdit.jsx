import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { profileCompletionPercent } from '../utils/profileCompletion';
import LoadingSpinner from '../components/LoadingSpinner';

export default function ProfileEdit () {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    full_name: '',
    age: '',
    gender: '',
    city: '',
    bio: '',
    interests: '',
    avatar_url: ''
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: e } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (e) {
        setError(e.message);
      } else if (data) {
        setForm({
          full_name: data.full_name || '',
          age: data.age != null ? String(data.age) : '',
          gender: data.gender || '',
          city: data.city || '',
          bio: data.bio || '',
          interests: data.interests || '',
          avatar_url: data.avatar_url || ''
        });
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  function update (key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handlePhoto (e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (upErr) {
      setError(upErr.message);
      return;
    }
    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    const publicUrl = pub.publicUrl;
    update('avatar_url', publicUrl);
    setMessage('Photo uploaded — save profile to keep changes.');
  }

  async function handleSubmit (e) {
    e.preventDefault();
    setError('');
    setMessage('');

    const ageNum = form.age === '' ? null : Number(form.age);
    if (ageNum !== null && (!Number.isFinite(ageNum) || ageNum < 18)) {
      setError('Age must be 18 or older.');
      return;
    }

    setSaving(true);
    const { error: uErr } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim() || null,
        age: ageNum,
        gender: form.gender.trim() || null,
        city: form.city.trim() || null,
        bio: form.bio.trim() || null,
        interests: form.interests.trim() || null,
        avatar_url: form.avatar_url.trim() || null
      })
      .eq('id', user.id);
    setSaving(false);
    if (uErr) {
      setError(uErr.message);
      return;
    }
    setMessage('Profile saved.');
  }

  if (loading) {
    return <LoadingSpinner />;
  }

  const pct = profileCompletionPercent({
    ...form,
    age: form.age ? Number(form.age) : null
  });

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Your profile</h1>
        <p className="text-sm text-binokio-muted">
          Completion:{' '}
          <span className="font-semibold text-binokio-accent">{pct}%</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-3xl border border-white/10 bg-binokio-card/50 p-6">
        <div className="flex items-center gap-4">
          <div className="h-20 w-20 overflow-hidden rounded-2xl bg-black/40">
            {form.avatar_url ? (
              <img
                src={form.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-2xl text-white/40">
                +
              </div>
            )}
          </div>
          <label className="cursor-pointer rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/5">
            Upload photo
            <input type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </label>
        </div>

        <Field label="Name" id="full_name">
          <input
            id="full_name"
            value={form.full_name}
            onChange={(e) => update('full_name', e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </Field>
        <Field label="Age" id="age">
          <input
            id="age"
            type="number"
            min={18}
            value={form.age}
            onChange={(e) => update('age', e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </Field>
        <Field label="Gender" id="gender">
          <input
            id="gender"
            value={form.gender}
            onChange={(e) => update('gender', e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
            placeholder="e.g. woman, man, non-binary"
          />
        </Field>
        <Field label="City" id="city">
          <input
            id="city"
            value={form.city}
            onChange={(e) => update('city', e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </Field>
        <Field label="Bio" id="bio">
          <textarea
            id="bio"
            rows={3}
            value={form.bio}
            onChange={(e) => update('bio', e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
          />
        </Field>
        <Field label="Interests" id="interests">
          <input
            id="interests"
            value={form.interests}
            onChange={(e) => update('interests', e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none ring-binokio-accent focus:ring-2"
            placeholder="Coffee, hiking, indie films…"
          />
        </Field>

        {error ? (
          <p className="rounded-lg bg-red-500/20 px-3 py-2 text-sm text-red-100">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="rounded-lg bg-emerald-500/20 px-3 py-2 text-sm text-emerald-100">
            {message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-full bg-binokio-accent py-3 font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </form>
    </div>
  );
}

function Field ({ label, id, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm text-white/70" htmlFor={id}>
        {label}
      </label>
      {children}
    </div>
  );
}
