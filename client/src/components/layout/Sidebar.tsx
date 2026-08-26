import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FolderKanban,
  Mail,
  AtSign,
  BarChart3,
  LogOut,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { inviteService } from '../../services/invite.service';
import { Avatar } from '../ui/Avatar';

export function Sidebar() {
  const { user, logout } = useAuth();

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', 'pending'],
    queryFn: inviteService.getPending,
    refetchInterval: 60_000,
  });
  const pendingCount = invites.length;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true, badge: 0 },
    { to: '/projects', icon: FolderKanban, label: 'Projects', end: false, badge: 0 },
    { to: '/invites', icon: Mail, label: 'Invites', end: false, badge: pendingCount },
    { to: '/mentions', icon: AtSign, label: 'Mentions', end: false, badge: 0 },
    { to: '/reports', icon: BarChart3, label: 'Reports', end: false, badge: 0 },
  ];

  return (
    <aside className="flex h-full w-60 flex-col bg-gray-900">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-700/50">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500">
          <Zap className="h-4 w-4 text-white" />
        </div>
        <span className="text-base font-bold text-white tracking-tight">CollabFlow</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, end, badge }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{label}</span>
            {badge > 0 && (
              <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-500 px-1.5 py-0.5 text-xs font-semibold text-white">
                {badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User footer */}
      <div className="border-t border-gray-700/50 p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user?.name ?? ''} avatarUrl={user?.avatarUrl} size="sm" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="rounded-md p-1.5 text-gray-400 hover:bg-gray-700 hover:text-white transition-colors"
            title="Logout"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
