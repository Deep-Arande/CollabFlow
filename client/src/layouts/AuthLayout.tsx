import { Outlet, Navigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PageSpinner } from '../components/ui/Spinner';

export function AuthLayout() {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="flex h-screen items-center justify-center"><PageSpinner /></div>;
  if (user) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-gray-900 p-12">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">CollabFlow</span>
        </div>
        <div>
          <h2 className="text-4xl font-bold text-white leading-tight">
            Ship projects faster,<br />together.
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Real-time task management built for modern teams. Assign, track, and collaborate without the noise.
          </p>
        </div>
        <p className="text-sm text-gray-500">© {new Date().getFullYear()} CollabFlow</p>
      </div>

      {/* Right auth form */}
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">CollabFlow</span>
          </div>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
