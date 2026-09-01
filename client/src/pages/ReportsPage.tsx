import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueries } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Target, CheckCircle2, AlertTriangle, TrendingUp, Clock } from 'lucide-react';
import { reportService } from '../services/report.service';
import { projectService } from '../services/project.service';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Badge } from '../components/ui/Badge';
import { Avatar } from '../components/ui/Avatar';
import { PageSpinner } from '../components/ui/Spinner';
import type { TaskPriority } from '../types';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  onClick?: () => void;
  active?: boolean;
}

function StatCard({ label, value, icon: Icon, color, onClick, active }: StatCardProps) {
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
  } ${onClick ? 'cursor-pointer hover:border-indigo-300 text-left w-full' : ''}`;

  if (onClick) return <button onClick={onClick} className={className}>{content}</button>;
  return <div className={className}>{content}</div>;
}

const PRIORITY_ORDER: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const PRIORITY_BAR_COLOR: Record<TaskPriority, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-yellow-400',
  HIGH: 'bg-orange-400',
  CRITICAL: 'bg-red-400',
};
const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

type StatFilter = 'TOTAL' | 'COMPLETED' | 'IN_PROGRESS' | 'DELAYED' | null;
const STAT_FILTER_LABEL: Record<string, string> = {
  TOTAL: 'All tasks',
  COMPLETED: 'Completed tasks',
  IN_PROGRESS: 'In-progress tasks',
  DELAYED: 'Delayed tasks',
};

export function ReportsPage() {
  const [projectId, setProjectId] = useState('');
  const [statFilter, setStatFilter] = useState<StatFilter>(null);
  const [memberFilter, setMemberFilter] = useState(''); // '' = all, 'unassigned' = no assignee, else a userId

  const toggleFilter = (f: Exclude<StatFilter, null>) => {
    setStatFilter((cur) => (cur === f ? null : f));
    setMemberFilter('');
  };

  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'reports-filter'],
    queryFn: () => projectService.list({ limit: 100 }),
  });
  // Reports are only meaningful (and only authorized) for projects you lead.
  const ledProjects = (projectsData?.projects ?? []).filter((p) => p.myRole === 'LEAD');
  const viewingAll = projectId === '';

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['reports', 'overview', projectId],
    queryFn: () => reportService.getOverview(projectId || undefined),
    enabled: ledProjects.length > 0,
  });

  const { data: performance = [], isLoading: perfLoading } = useQuery({
    queryKey: ['reports', 'team-performance', projectId],
    queryFn: () => reportService.getTeamPerformance(projectId || undefined),
    enabled: ledProjects.length > 0,
  });

  // Backs both the "Export" button and the Delayed Tasks list — the export payload
  // already carries full task objects, so there's no need for a second endpoint.
  const { data: exportData, isFetching: exportFetching } = useQuery({
    queryKey: ['reports', 'export', projectId],
    queryFn: () => reportService.exportReport(projectId || undefined),
    enabled: ledProjects.length > 0,
  });

  // One overview call per led project, only fired when comparing "all projects" with
  // more than one led project — otherwise there's nothing to compare.
  const perProjectResults = useQueries({
    queries: (viewingAll && ledProjects.length > 1 ? ledProjects : []).map((p) => ({
      queryKey: ['reports', 'overview', p.id],
      queryFn: () => reportService.getOverview(p.id),
    })),
  });

  // Full member roster (not just people who already have tasks assigned) for the
  // member-filter dropdown on the drill-down panel, so the Lead shows up even with
  // zero assigned tasks. One call per project in scope (just the selected one, or
  // every led project when viewing "All").
  const memberProjectIds = projectId ? [projectId] : ledProjects.map((p) => p.id);
  const memberResults = useQueries({
    queries: memberProjectIds.map((id) => ({
      queryKey: ['projects', id, 'members'],
      queryFn: () => projectService.getMembers(id),
    })),
  });
  const memberRoster = (() => {
    const byUserId = new Map<string, { id: string; name: string; isLead: boolean }>();
    memberResults.forEach((r) => {
      (r.data ?? []).forEach((m) => {
        if (m.status !== 'ACCEPTED' || !m.user) return;
        const isLead = m.role === 'LEAD' || byUserId.get(m.userId)?.isLead === true;
        byUserId.set(m.userId, { id: m.userId, name: m.user.name, isLead });
      });
    });
    return Array.from(byUserId.values()).sort((a, b) =>
      a.isLead !== b.isLead ? (a.isLead ? -1 : 1) : a.name.localeCompare(b.name)
    );
  })();

  const handleExport = () => {
    if (!exportData) return;
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collabflow-report-${format(new Date(), 'yyyy-MM-dd')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isLoading = overviewLoading || perfLoading;
  const maxPriorityCount = Math.max(1, ...PRIORITY_ORDER.map((p) => overview?.byPriority[p] ?? 0));
  const dailyEntries = Object.entries(overview?.dailyCompleted ?? {});
  const maxDaily = Math.max(1, ...dailyEntries.map(([, c]) => c));

  const exportTasks = exportData?.tasks ?? [];
  const delayedTasks = exportTasks
    .filter((t) => t.status !== 'COMPLETED' && t.dueDate && new Date(t.dueDate) < new Date())
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime());
  const listByFilter: Record<string, typeof exportTasks> = {
    TOTAL: exportTasks,
    COMPLETED: exportTasks.filter((t) => t.status === 'COMPLETED'),
    IN_PROGRESS: exportTasks.filter((t) => t.status === 'IN_PROGRESS'),
    DELAYED: delayedTasks,
  };
  const activeList = statFilter ? listByFilter[statFilter] : [];
  const filteredList = activeList.filter((t) => {
    if (!memberFilter) return true;
    if (memberFilter === 'unassigned') return !t.assignedTo;
    return t.assignedTo === memberFilter;
  });
  const memberOptions = [
    { value: '', label: 'All members' },
    { value: 'unassigned', label: 'Unassigned' },
    ...memberRoster.map((m) => ({ value: m.id, label: m.isLead ? `${m.name} (Lead)` : m.name })),
  ];

  return (
    <div className="flex flex-col">
      <Header
        title="Reports"
        subtitle="Scoped to projects you lead"
        actions={
          ledProjects.length > 0 && (
            <div className="flex items-center gap-2">
              <Select
                value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setStatFilter(null); setMemberFilter(''); }}
                options={[{ value: '', label: 'All projects I lead' }, ...ledProjects.map((p) => ({ value: p.id, label: p.name }))]}
              />
              <Button variant="secondary" size="sm" onClick={handleExport} disabled={!exportData} isLoading={exportFetching && !exportData}>
                <Download className="h-4 w-4" /> Export JSON
              </Button>
            </div>
          )
        }
      />

      <div className="p-6 space-y-6">
        {ledProjects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-indigo-50 p-4 mb-4">
              <TrendingUp className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">You don't lead any projects yet</h3>
            <p className="mt-1 text-sm text-gray-500 max-w-sm">
              Reports are only available for projects where you're a Lead. Create a project, or ask a Lead to promote you on one you're already a member of.
            </p>
          </div>
        ) : isLoading ? (
          <PageSpinner />
        ) : !overview || overview.total === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-indigo-50 p-4 mb-4">
              <TrendingUp className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">No report data yet</h3>
            <p className="mt-1 text-sm text-gray-500 max-w-sm">
              Once tasks exist in a project you lead, stats will show up here.
            </p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              <StatCard
                label="Total Tasks"
                value={overview.total}
                icon={Target}
                color="bg-indigo-500"
                onClick={() => toggleFilter('TOTAL')}
                active={statFilter === 'TOTAL'}
              />
              <StatCard
                label="Completed"
                value={overview.completed}
                icon={CheckCircle2}
                color="bg-emerald-500"
                onClick={() => toggleFilter('COMPLETED')}
                active={statFilter === 'COMPLETED'}
              />
              <StatCard
                label="In Progress"
                value={overview.inProgress}
                icon={Clock}
                color="bg-amber-500"
                onClick={() => toggleFilter('IN_PROGRESS')}
                active={statFilter === 'IN_PROGRESS'}
              />
              <StatCard
                label="Delayed"
                value={overview.delayed}
                icon={AlertTriangle}
                color="bg-rose-500"
                onClick={() => toggleFilter('DELAYED')}
                active={statFilter === 'DELAYED'}
              />
              <StatCard label="Completion Rate" value={`${overview.completionRate}%`} icon={TrendingUp} color="bg-blue-500" />
            </div>

            {/* Drill-down detail — expands under the stat row for whichever card is active,
                with an optional member filter (includes the Lead even if they have 0 tasks) */}
            {statFilter && (
              <div className={`rounded-xl border ${statFilter === 'DELAYED' ? 'border-rose-200 bg-rose-50/40' : 'border-indigo-200 bg-indigo-50/40'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className={`text-sm font-semibold ${statFilter === 'DELAYED' ? 'text-rose-700' : 'text-indigo-700'}`}>
                    {STAT_FILTER_LABEL[statFilter]} ({filteredList.length})
                  </span>
                  {memberRoster.length > 0 && (
                    <Select value={memberFilter} onChange={(e) => setMemberFilter(e.target.value)} options={memberOptions} />
                  )}
                </div>
                <div className={`divide-y px-1 pb-1 ${statFilter === 'DELAYED' ? 'divide-rose-100' : 'divide-indigo-100'}`}>
                  {filteredList.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-gray-400">
                      {memberFilter ? 'No matching tasks for this member.' : 'Nothing here right now.'}
                    </p>
                  ) : (
                    filteredList.map((t) => (
                      <Link
                        key={t.id}
                        to={`/projects/${t.projectId}/tasks/${t.id}`}
                        className="flex items-center gap-4 rounded-lg px-4 py-3 hover:bg-white transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {t.project?.name ?? 'Unknown project'} · {t.assignee ? t.assignee.name : 'Unassigned'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={t.priority} />
                          <Badge variant={t.status} />
                          {t.dueDate && (
                            <span className={`text-xs font-medium ${statFilter === 'DELAYED' ? 'text-red-500' : 'text-gray-400'}`}>
                              {format(new Date(t.dueDate), 'MMM d')}
                            </span>
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Priority breakdown */}
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-gray-900">Tasks by Priority</h2>
                </div>
                <div className="p-5 space-y-3">
                  {PRIORITY_ORDER.map((p) => {
                    const count = overview.byPriority[p] ?? 0;
                    return (
                      <div key={p} className="flex items-center gap-3">
                        <span className="w-16 shrink-0 text-xs font-medium text-gray-500">{PRIORITY_LABEL[p]}</span>
                        <div className="flex-1 h-2.5 rounded-full bg-gray-100 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${PRIORITY_BAR_COLOR[p]}`}
                            style={{ width: `${(count / maxPriorityCount) * 100}%` }}
                          />
                        </div>
                        <span className="w-6 shrink-0 text-right text-xs font-medium text-gray-700">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Team performance */}
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-gray-900">Team Performance</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {performance.length === 0 ? (
                    <p className="px-5 py-6 text-center text-sm text-gray-400">No assigned tasks yet</p>
                  ) : (
                    performance.map((m) => (
                      <div key={m.id} className="flex items-center gap-3 px-5 py-3">
                        <Avatar name={m.name} avatarUrl={m.avatarUrl ?? undefined} size="sm" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{m.name}</p>
                          <p className="text-xs text-gray-400">
                            {m.completed}/{m.total} done · {m.inProgress} in progress
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-700 shrink-0">{m.completionRate}%</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Completion trend */}
            <div className="rounded-xl border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-gray-900">Completed Tasks · Last 7 Days</h2>
              </div>
              <div className="p-5 flex items-end gap-3 h-36">
                {dailyEntries.map(([day, count]) => (
                  <div key={day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-xs font-medium text-gray-700">{count}</span>
                    <div
                      className="w-full rounded-t-md bg-indigo-400"
                      style={{ height: `${Math.max(4, (count / maxDaily) * 100)}%` }}
                    />
                    <span className="text-xs text-gray-400">{format(new Date(day), 'EEE')}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Per-project comparison — only useful when leading more than one project */}
            {viewingAll && ledProjects.length > 1 && (
              <div className="rounded-xl border border-gray-200 bg-white">
                <div className="border-b border-gray-100 px-5 py-4">
                  <h2 className="text-sm font-semibold text-gray-900">By Project</h2>
                </div>
                <div className="divide-y divide-gray-50">
                  {ledProjects.map((p, i) => {
                    const r = perProjectResults[i];
                    if (!r || r.isLoading || !r.data) {
                      return (
                        <div key={p.id} className="px-5 py-3 text-sm text-gray-400">{p.name} · loading…</div>
                      );
                    }
                    const d = r.data;
                    return (
                      <button
                        key={p.id}
                        onClick={() => { setProjectId(p.id); setStatFilter(null); setMemberFilter(''); }}
                        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            {d.completed}/{d.total} done{d.delayed > 0 && ` · ${d.delayed} delayed`}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-700 shrink-0">{d.completionRate}%</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
