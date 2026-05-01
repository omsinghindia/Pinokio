/**
 * Shown when Vite env vars are missing — common cause of “blank” or broken auth UI.
 */
export default function EnvBanner () {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (url && key) {
    return null;
  }
  return (
    <div className="relative z-[100] border-b border-red-400/50 bg-red-950 px-4 py-3 text-center text-sm text-red-100 shadow-lg">
      <strong>Configuration:</strong> Create{' '}
      <code className="rounded bg-black/30 px-1">frontend/.env.local</code> with{' '}
      <code className="rounded bg-black/30 px-1">VITE_SUPABASE_URL</code> and{' '}
      <code className="rounded bg-black/30 px-1">VITE_SUPABASE_ANON_KEY</code>, then restart{' '}
      <code className="rounded bg-black/30 px-1">npm run dev</code>.
    </div>
  );
}
