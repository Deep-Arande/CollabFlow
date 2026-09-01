import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FolderKanban, CheckCircle2, Clock, AlertTriangle, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { dashboardService } from '../services/dashboard.service';
import { Header } from '../components/layout/Header';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { PageSpinner } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import type { ActivityLog, Task } from '../types';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  to?: string;
  onClick?: () => void;
  active?: boolean;
}

function StatCard({ label, value, icon: Icon, color, to, onClick, active }: StatCardProps) {
  const content = (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      </div>
      <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
        <Icon className="h-6 w-6 text-white" />
      </div>
    </div>
  );
  const className = `rounded-xl bg-white border p-5 transition-colors ${
    active ? 'border-indigo-400 ring-1 ring-indigo-400' : 'border-gray-200'
  } ${to || onClick ? 'cursor-pointer hover:border-indigo-300' : ''}`;

  if (to) return <Link to={to} className={className}>{content}</Link>;
  if (onClick) return <button onClick={onClick} className={`${className} text-left w-full`}>{content}</button>;
  return <div className={className}>{content}</div>;
}

function taskHref(task: Task) {
  return `/projects/${task.projectId}/tasks/${task.id}`;
}

function TaskRow({ task, showProject }: { task: Task; showProject?: boolean }) {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
  return (
    <Link
      to={taskHref(task)}
      className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          {showProject && task.project && (
            <span className="text-xs text-gray-400 truncate">{task.project.name}</span>
          )}
          {task.dueDate && (
            <p className={`text-xs ${overdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
              {showProject && task.project && '· '}Due {format(new Date(task.dueDate), 'MMM d')}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge variant={task.priority} />
        <Badge variant={task.status} />
      </div>
    </Link>
  );
}

// Best-effort link target for an activity log entry — Task events deep-link to the
// exact task; everything else (Project/Comment/Attachment) falls back to the project,
// since Comment/Attachment target ids aren't task ids.
function activityHref(log: ActivityLog): string | null {
  if (!log.projectId) return null;
  if (log.targetType === 'Task') return `/projects/${log.projectId}/tasks/${log.targetId}`;
  return `/projects/${log.projectId}`;
}

function ActivityItem({ log }: { log: ActivityLog }) {
  const href = activityHref(log);
  const body = (
    <div className="flex items-start gap-3 py-3">
      <Avatar name={log.user?.name ?? '?'} size="sm" className="shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700">
          <span className="font-medium">{log.user?.name}</span>{' '}
          {log.action.toLowerCase().replace(/_/g, ' ')} {log.targetType.toLowerCase()}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{format(new Date(log.createdAt), 'MMM d, h:mm a')}</p>
      </div>
    </div>
  );
  if (!href) return body;
  return (
    <Link to={href} className="block px-1 -mx-1 rounded-lg hover:bg-gray-50 transition-colors">
      {body}
    </Link>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [showOverdue, setShowOverdue] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardService.getStats,
  });

  if (isLoading) return <PageSpinner />;

  const stats = data ?? {
    totalProjects: 0, activeTasks: 0, completedTasks: 0, overdueTasksCount: 0,
    myTasks: [], overdueTasks: [], recentActivity: [],
  };

  return (
    <div className="flex flex-col">
      <Header
        title={`Good day, ${user?.name?.split(' ')[0]}`}
        subtitle="Here's what's happening across your projects"
      />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Total Projects" value={stats.totalProjects} icon={FolderKanban} color="bg-indigo-500" to="/projects" />
          <StatCard label="Active Tasks" value={stats.activeTasks} icon={Clock} color="bg-blue-500" />
          <StatCard label="Completed" value={stats.completedTasks} icon={CheckCircle2} color="bg-emerald-500" />
          <StatCard
            label="Overdue"
            value={stats.overdueTasksCount}
            icon={AlertTriangle}
            color="bg-rose-500"
            onClick={() => setShowOverdue((v) => !v)}
            active={showOverdue}
          />
        </div>

        {/* Overdue detail — expands under the stat row when the Overdue card is clicked */}
        {showOverdue && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/40">
            <button
              onClick={() => setShowOverdue(false)}
              className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-rose-700"
            >
              <span>Overdue tasks across your projects</span>
              <ChevronDown className="h-4 w-4 rotate-180 transition-transform" />
            </button>
            <div className="divide-y divide-rose-100 px-1 pb-1">
              {stats.overdueTasks.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">Nothing overdue — you're all caught up.</p>
              ) : (
                stats.overdueTasks.map((t) => <TaskRow key={t.id} task={t} showProject />)
              )}
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* My tasks */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">My Tasks</h2>
            </div>
            <div className="divide-y divide-gray-50 px-1">
              {stats.myTasks.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-gray-400">No tasks assigned to you</p>
              ) : (
                stats.myTasks.slice(0, 8).map((t) => <TaskRow key={t.id} task={t} />)
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </div>
            <div className="divide-y divide-gray-50 px-5">
              {stats.recentActivity.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No recent activity</p>
              ) : (
                stats.recentActivity.slice(0, 8).map((log) => <ActivityItem key={log.id} log={log} />)
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
