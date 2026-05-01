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
        className={`mx-auto w-full min-w-0 max-w-6xl flex-1 px-3 py-4 sm:px-4 sm:py-6 md:py-8 ${
          user ? 'pb-28 lg:pb-8' : ''
        }`}
      >
        <Outlet />
      </main>
      {user ? <BottomNav /> : null}
    </div>
  );
}
