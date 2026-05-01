import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import LoadingSpinner from './components/LoadingSpinner';
import { useAuth } from './contexts/AuthContext';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import Browse from './pages/Browse';
import Matches from './pages/Matches';
import Chat from './pages/Chat';
import ProfileEdit from './pages/ProfileEdit';
import About from './pages/About';
import EnvBanner from './components/EnvBanner';

function HomeGate () {
  const { user, loading } = useAuth();
  if (loading) {
    return <LoadingSpinner />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Landing />;
}

function GuestOnly ({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <LoadingSpinner />;
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App () {
  return (
    <>
      <EnvBanner />
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<HomeGate />} />
        <Route
          path="/login"
          element={
            <GuestOnly>
              <Login />
            </GuestOnly>
          }
        />
        <Route
          path="/signup"
          element={
            <GuestOnly>
              <Signup />
            </GuestOnly>
          }
        />
        <Route path="/about" element={<About />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/browse"
          element={
            <ProtectedRoute>
              <Browse />
            </ProtectedRoute>
          }
        />
        <Route
          path="/matches"
          element={
            <ProtectedRoute>
              <Matches />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfileEdit />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat/:matchId"
          element={
            <ProtectedRoute>
              <Chat />
            </ProtectedRoute>
          }
        />
      </Route>
    </Routes>
    </>
  );
}
