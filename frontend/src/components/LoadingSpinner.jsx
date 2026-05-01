export default function LoadingSpinner ({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-binokio-muted">
      <div
        className="h-10 w-10 animate-spin rounded-full border-2 border-binokio-accent border-t-transparent"
        aria-hidden
      />
      <p className="text-sm">{label}</p>
    </div>
  );
}
