import { Link } from 'react-router-dom';

export default function Landing () {
  return (
    <div className="flex min-h-[65dvh] flex-col items-center justify-center px-3 text-center sm:min-h-[70vh] sm:px-4">
      <p className="mb-2 text-xs font-medium uppercase tracking-widest text-binokio-accent sm:text-sm">
        Real connections
      </p>
      <h1 className="font-display max-w-2xl text-3xl font-bold leading-tight xs:text-4xl sm:text-5xl">
        Meet someone who actually{' '}
        <span className="text-binokio-accent">gets you</span>
      </h1>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-binokio-muted sm:text-base">
        BINOKIO matches you with real people. Chat in real time once you have a
        mutual match — with photos, voice notes, and location when you want to
        share. Works on phones and tablets.
      </p>
      <div className="mt-8 flex w-full max-w-md flex-col gap-3 xs:flex-row xs:flex-wrap xs:justify-center sm:mt-10">
        <Link
          to="/signup"
          className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-binokio-accent px-8 py-3 text-center text-sm font-semibold text-white shadow-xl shadow-binokio-accent/25 transition hover:brightness-110 sm:text-base"
        >
          Join free
        </Link>
        <Link
          to="/login"
          className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-white/25 px-8 py-3 text-center text-sm font-semibold text-white/90 hover:border-white/50 sm:text-base"
        >
          I have an account
        </Link>
      </div>
      <p className="mt-8 text-sm text-binokio-muted">
        <Link to="/about" className="text-binokio-accent underline-offset-2 hover:underline">
          About BINOKIO
        </Link>
      </p>
    </div>
  );
}
