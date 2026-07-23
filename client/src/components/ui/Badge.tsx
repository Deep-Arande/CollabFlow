import type { TaskPriority, TaskStatus, ProjectStatus, Role } from '../../types';

type BadgeVariant = 'default' | TaskPriority | TaskStatus | ProjectStatus | Role;

const styles: Record<string, string> = {
  default: 'bg-gray-100 text-gray-700',
  LOW: 'bg-slate-100 text-slate-600',
  MEDIUM: 'bg-yellow-100 text-yellow-700',
  HIGH: 'bg-orange-100 text-orange-700',
  CRITICAL: 'bg-red-100 text-red-700',
  TODO: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  REVIEW: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-green-100 text-green-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  ARCHIVED: 'bg-gray-100 text-gray-500',
  ADMIN: 'bg-red-100 text-red-700',
  TEAM_LEAD: 'bg-indigo-100 text-indigo-700',
  TEAM_MEMBER: 'bg-gray-100 text-gray-600',
};

const labels: Record<string, string> = {
  IN_PROGRESS: 'In Progress',
  TEAM_LEAD: 'Team Lead',
  TEAM_MEMBER: 'Member',
};

interface BadgeProps {
  variant?: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
}

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  const style = styles[variant as string] ?? styles.default;
  const text = children ?? (labels[variant as string] || String(variant).replace(/_/g, ' '));
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style} ${className}`}>
      {text}
    </span>
  );
}
