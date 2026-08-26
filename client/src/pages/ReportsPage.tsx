import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Download, Target, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react';
import { reportService } from '../services/report.service';
import { projectService } from '../services/project.service';
import { Header } from '../components/layout/Header';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Select';
import { Avatar } from '../components/ui/Avatar';
import { PageSpinner } from '../components/ui/Spinner';
import type { TaskPriority } from '../types';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
}

function StatCard({ label, value, icon: Icon, color }: StatCardProps) {
  return (
    <div className="rounded-xl bg-white border border-gray-200 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
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

export function ReportsPage() {
  const [projectId, setProjectId] = useState('');

  const { data: projectsData } = useQuery({
    queryKey: ['projects', 'reports-filter'],
    queryFn: () => projectService.list({ limit: 100 }),
  });
  // Reports are only meaningful (and only authorized) for projects you lead.
  const ledProjects = (projectsData?.projects ?? []).filter((p) => p.myRole === 'LEAD');

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['reports', 'overview', projectId],
    queryFn: () => reportService.getOverview(projectId || undefined),
  });

  const { data: performance = [], isLoading: perfLoading } = useQuery({
    queryKey: ['reports', 'team-performance', projectId],
    queryFn: () => reportService.getTeamPerformance(projectId || undefined),
  });

  const { mutate: exportReport, isPending: exporting } = useMutation({
    mutationFn: () => reportService.exportReport(projectId || undefined),
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `collabflow-report-${format(new Date(), 'yyyy-MM-dd')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
  });

  const isLoading = overviewLoading || perfLoading;
  const maxPriorityCount = Math.max(1, ...PRIORITY_ORDER.map((p) => overview?.byPriority[p] ?? 0));

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
                onChange={(e) => setProjectId(e.target.value)}
                options={[{ value: '', label: 'All projects I lead' }, ...ledProjects.map((p) => ({ value: p.id, label: p.name }))]}
              />
              <Button variant="secondary" size="sm" onClick={() => exportReport()} isLoading={exporting}>
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Total Tasks" value={overview.total} icon={Target} color="bg-indigo-500" />
              <StatCard label="Completed" value={overview.completed} icon={CheckCircle2} color="bg-emerald-500" />
              <StatCard label="Delayed" value={overview.delayed} icon={AlertTriangle} color="bg-rose-500" />
              <StatCard label="Completion Rate" value={`${overview.completionRate}%`} icon={TrendingUp} color="bg-blue-500" />
            </div>

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
          </>
        )}
      </div>
    </div>
  );
}
