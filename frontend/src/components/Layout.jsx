import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Navbar from './Navbar';
import BottomNav from './BottomNav';

export default function Layout () {
  const { user } = useAuth();

  return (
    <div className="flex min-h-[100dvh] min-h-screen flex-col overflow-x-hidden bg-hero-gradient">
      <Navbar />
      <main
        className={`mx-auto flex w-full min-h-0 min-w-0 max-w-6xl flex-1 flex-col px-3 py-3 sm:px-4 sm:py-6 md:py-8 ${
          user ? 'pb-24 sm:pb-28 lg:pb-8' : ''
        }`}
      >
        <Outlet />
      </main>
      {user ? <BottomNav /> : null}
    </div>
  );
}
