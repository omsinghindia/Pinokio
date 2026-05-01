import { Link } from 'react-router-dom';

/** App name: BINOKIO — accent on “OKIO” */
export default function BrandWordmark ({ to = '/', className = '' }) {
  const inner = (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      BIN<span className="text-binokio-accent">OKIO</span>
    </span>
  );
  if (to) {
    return <Link to={to}>{inner}</Link>;
  }
  return inner;
}
