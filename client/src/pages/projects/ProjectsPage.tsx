import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { Plus, Users, CheckSquare, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { projectService } from '../../services/project.service';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import type { Project } from '../../types';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  dueDate: z.string().min(1, 'Due date is required'),
});
type FormData = z.infer<typeof schema>;

function ProjectCard({ project }: { project: Project }) {
  const overdue = new Date(project.dueDate) < new Date() && project.status === 'ACTIVE';

  return (
    <Link
      to={`/projects/${project.id}`}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-5 hover:border-indigo-300 hover:shadow-md transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
          {project.name}
        </h3>
        <Badge variant={project.status} />
      </div>
      {project.description && (
        <p className="mt-2 text-sm text-gray-500 line-clamp-2">{project.description}</p>
      )}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <CheckSquare className="h-3.5 w-3.5" />
          {project._count?.tasks ?? 0} tasks
        </span>
        <span className="flex items-center gap-1">
          <Users className="h-3.5 w-3.5" />
          {project._count?.members ?? 0} members
        </span>
        <span className={`flex items-center gap-1 ml-auto ${overdue ? 'text-red-500' : ''}`}>
          <Calendar className="h-3.5 w-3.5" />
          {format(new Date(project.dueDate), 'MMM d, yyyy')}
        </span>
      </div>
    </Link>
  );
}

export function ProjectsPage() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const { user } = useAuth();
  const canCreate = user?.role === 'ADMIN' || user?.role === 'TEAM_LEAD';

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectService.list({ limit: 50 }),
  });

  const { mutate: create, isPending } = useMutation({
    mutationFn: (d: FormData) => projectService.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      setOpen(false);
      setError(null);
      reset();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Failed to create project';
      setError(msg);
    },
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  if (isLoading) return <PageSpinner />;
  const projects = data?.projects ?? [];

  return (
    <div className="flex flex-col">
      <Header
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? 's' : ''}`}
        actions={
          canCreate && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New Project
            </Button>
          )
        }
      />

      <div className="p-6">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-indigo-50 p-4 mb-4">
              <CheckSquare className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">No projects yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              {canCreate ? 'Create your first project to get started.' : 'You have not been added to any projects yet.'}
            </p>
            {canCreate && (
              <Button className="mt-4" onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" /> New Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => <ProjectCard key={p.id} project={p} />)}
          </div>
        )}
      </div>

      <Modal isOpen={open} onClose={() => { setOpen(false); reset(); setError(null); }} title="New Project">
        <form onSubmit={handleSubmit((d) => create(d))} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}
          <Input label="Project name" placeholder="Q4 Launch Plan" error={errors.name?.message} {...register('name')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 resize-none"
              rows={3}
              placeholder="What is this project about?"
              {...register('description')}
            />
          </div>
          <Input label="Due date" type="date" error={errors.dueDate?.message} {...register('dueDate')} />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setOpen(false); reset(); setError(null); }}>Cancel</Button>
            <Button type="submit" isLoading={isPending}>Create Project</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
