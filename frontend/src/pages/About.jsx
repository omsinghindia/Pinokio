import { Link } from 'react-router-dom';
import BrandWordmark from '../components/BrandWordmark';

export default function About () {
  return (
    <div className="mx-auto max-w-lg space-y-6 px-1 text-center sm:text-left">
      <BrandWordmark to="/" className="text-2xl" />
      <h1 className="font-display text-2xl font-bold sm:text-3xl">About BINOKIO</h1>
      <p className="text-sm leading-relaxed text-binokio-muted sm:text-base">
        BINOKIO helps you meet real people safely: mutual matches before chat,
        profiles with photos, and tools to block or report. Built for phones and
        tablets as well as desktop.
      </p>
      <ul className="list-inside list-disc space-y-2 text-left text-sm text-white/80 sm:text-base">
        <li>18+ community with email sign-in</li>
        <li>Real-time chat after a match</li>
        <li>Your data stays in your Supabase project (self-hosted backend)</li>
      </ul>
      <div className="flex flex-wrap justify-center gap-3 pt-4 sm:justify-start">
        <Link
          to="/signup"
          className="rounded-full bg-binokio-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-binokio-accent/25"
        >
          Join BINOKIO
        </Link>
        <Link
          to="/login"
          className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white/90"
        >
          Log in
        </Link>
      </div>
    </div>
  );
}
