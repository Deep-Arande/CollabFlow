import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import {
  Plus, ArrowLeft, Trash2, MessageSquare, Calendar, User, Flag, Send, Shield,
} from 'lucide-react';
import { projectService } from '../../services/project.service';
import { taskService } from '../../services/task.service';
import { commentService } from '../../services/comment.service';
import { activityService } from '../../services/activity.service';
import { userService } from '../../services/user.service';
import { labelService } from '../../services/label.service';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import type { Task, TaskStatus, Comment, ProjectMember } from '../../types';

const COLUMNS: { status: TaskStatus; label: string; color: string }[] = [
  { status: 'TODO', label: 'To Do', color: 'border-t-gray-400' },
  { status: 'IN_PROGRESS', label: 'In Progress', color: 'border-t-blue-500' },
  { status: 'REVIEW', label: 'Review', color: 'border-t-purple-500' },
  { status: 'COMPLETED', label: 'Completed', color: 'border-t-emerald-500' },
];

// ── Task creation schema ──────────────────────────────────────────────────────
const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  dueDate: z.string().optional(),
  assignedTo: z.string().optional(),
});
type TaskFormData = z.infer<typeof taskSchema>;


// ── Task card ────────────────────────────────────────────────────────────────
function TaskCard({ task, onClick }: { task: Task; onClick: () => void }) {
  const overdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== 'COMPLETED';
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3.5 hover:border-indigo-300 hover:shadow-sm transition-all"
    >
      <p className="text-sm font-medium text-gray-900 line-clamp-2">{task.title}</p>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <Badge variant={task.priority} />
        {task.dueDate && (
          <span className={`flex items-center gap-1 text-xs ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
            <Calendar className="h-3 w-3" />
            {format(new Date(task.dueDate), 'MMM d')}
          </span>
        )}
      </div>
      {task.assignee && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <Avatar name={task.assignee.name} size="sm" />
          <span className="text-xs text-gray-500 truncate">{task.assignee.name}</span>
        </div>
      )}
    </button>
  );
}

// ── Task detail modal ────────────────────────────────────────────────────────
function TaskDetailModal({
  task,
  projectId,
  members,
  onClose,
}: {
  task: Task;
  projectId: string;
  members: ProjectMember[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: fullTask } = useQuery({
    queryKey: ['task', projectId, task.id],
    queryFn: () => taskService.get(projectId, task.id),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: (status: TaskStatus) => taskService.updateStatus(projectId, task.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', projectId] });
      qc.invalidateQueries({ queryKey: ['task', projectId, task.id] });
    },
  });

  const { mutate: deleteTask } = useMutation({
    mutationFn: () => taskService.delete(projectId, task.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', projectId] }); onClose(); },
  });

  const { mutate: addComment, isPending: commenting } = useMutation({
    mutationFn: () => commentService.create(projectId, task.id, comment),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['task', projectId, task.id] });
      setComment('');
      setMentionQuery(null);
    },
  });

  const handleCommentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const cur = e.target.selectionStart ?? val.length;
    setComment(val);
    const before = val.slice(0, cur);
    const match = before.match(/@(\w*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionStart(cur - match[0].length);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (member: ProjectMember) => {
    const slug = member.user!.name.replace(/\s+/g, '');
    const before = comment.slice(0, mentionStart);
    const after = comment.slice(mentionStart + 1 + (mentionQuery?.length ?? 0));
    const next = `${before}@${slug} ${after}`;
    setComment(next);
    setMentionQuery(null);
    setTimeout(() => {
      const pos = mentionStart + slug.length + 2;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  };

  const mentionMatches = mentionQuery !== null
    ? members.filter((m) => m.user?.name.toLowerCase().includes(mentionQuery.toLowerCase()))
    : [];

  const t = fullTask ?? task;
  const canEdit = user?.role === 'ADMIN' || user?.role === 'TEAM_LEAD' || user?.id === task.assignedTo || user?.id === task.createdBy;

  return (
    <div className="space-y-5">
      {/* Status selector */}
      <div className="flex items-center gap-2 flex-wrap">
        {COLUMNS.map((col) => (
          <button
            key={col.status}
            onClick={() => updateStatus(col.status)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              t.status === col.status ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {col.label}
          </button>
        ))}
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-gray-500">
          <Flag className="h-4 w-4" /> Priority: <Badge variant={t.priority} />
        </div>
        {t.assignee && (
          <div className="flex items-center gap-2 text-gray-500">
            <User className="h-4 w-4" />
            <Avatar name={t.assignee.name} size="sm" />
            {t.assignee.name}
          </div>
        )}
        {t.dueDate && (
          <div className="flex items-center gap-2 text-gray-500">
            <Calendar className="h-4 w-4" /> {format(new Date(t.dueDate), 'MMM d, yyyy')}
          </div>
        )}
      </div>

      {/* Description */}
      {t.description && (
        <div>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Description</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{t.description}</p>
        </div>
      )}

      {/* Comments */}
      <div>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2 flex items-center gap-1">
          <MessageSquare className="h-3.5 w-3.5" /> Comments ({t.comments?.length ?? 0})
        </p>
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {(t.comments ?? []).map((c: Comment) => (
            <div key={c.id} className="flex gap-2.5">
              <Avatar name={c.author?.name ?? '?'} size="sm" className="shrink-0 mt-0.5" />
              <div className="flex-1">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium text-gray-700">{c.author?.name}</p>
                  <p className="text-sm text-gray-600 mt-0.5 whitespace-pre-wrap">{c.content}</p>
                </div>
                <p className="text-xs text-gray-400 mt-0.5 px-1">{format(new Date(c.createdAt), 'MMM d, h:mm a')}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 relative">
          {/* @mention dropdown */}
          {mentionMatches.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 z-10 rounded-lg border border-gray-200 bg-white shadow-lg max-h-40 overflow-y-auto">
              {mentionMatches.map((m) => (
                <button
                  key={m.userId}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 transition-colors"
                >
                  <Avatar name={m.user?.name ?? '?'} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{m.user?.name}</p>
                    <p className="text-xs text-gray-400 truncate">{m.user?.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              ref={inputRef}
              value={comment}
              onChange={handleCommentChange}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setMentionQuery(null); return; }
                if (e.key === 'Enter' && !e.shiftKey && comment.trim() && mentionQuery === null) {
                  e.preventDefault();
                  addComment();
                }
              }}
              placeholder="Add a comment… type @ to mention someone"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <Button
              size="sm"
              onClick={() => comment.trim() && addComment()}
              isLoading={commenting}
              disabled={!comment.trim()}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Delete */}
      {canEdit && (
        <div className="border-t border-gray-100 pt-3 flex justify-end">
          <Button variant="danger" size="sm" onClick={() => { if (confirm('Delete this task?')) deleteTask(); }}>
            <Trash2 className="h-4 w-4" /> Delete task
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { joinProject, leaveProject, socket } = useSocket();
  const [tab, setTab] = useState<'board' | 'members' | 'activity'>('board');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);

  const pid = projectId!;

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ['project', pid],
    queryFn: () => projectService.get(pid),
  });

  const { data: taskData, isLoading: tasksLoading } = useQuery({
    queryKey: ['tasks', pid],
    queryFn: () => taskService.list(pid, { limit: 100 }),
    enabled: tab === 'board',
  });

  const { data: members = [] } = useQuery({
    queryKey: ['members', pid],
    queryFn: () => projectService.getMembers(pid),
    enabled: tab === 'members' || tab === 'board',
  });

  const { data: activityData } = useQuery({
    queryKey: ['activity', pid],
    queryFn: () => activityService.listForProject(pid),
    enabled: tab === 'activity',
  });

  const { data: searchedUsers = [] } = useQuery({
    queryKey: ['users', 'search', memberSearch],
    queryFn: () => userService.search(memberSearch),
    enabled: addMemberOpen && memberSearch.trim().length > 0,
  });

  const { data: allLabels = [] } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelService.list(),
  });

  // Real-time: join/leave socket room
  useEffect(() => {
    joinProject(pid);
    return () => leaveProject(pid);
  }, [pid, joinProject, leaveProject]);

  // Invalidate tasks on socket events
  useEffect(() => {
    if (!socket) return;
    const refresh = () => qc.invalidateQueries({ queryKey: ['tasks', pid] });
    socket.on('task:created', refresh);
    socket.on('task:updated', refresh);
    socket.on('task:deleted', refresh);
    socket.on('task:status_changed', refresh);
    return () => {
      socket.off('task:created', refresh);
      socket.off('task:updated', refresh);
      socket.off('task:deleted', refresh);
      socket.off('task:status_changed', refresh);
    };
  }, [socket, pid, qc]);

  // Task creation form
  const { register, handleSubmit, reset, formState: { errors } } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: { priority: 'MEDIUM' },
  });

  const { mutate: createTask, isPending: creating } = useMutation({
    mutationFn: (d: TaskFormData) =>
      taskService.create(pid, {
        ...d,
        status: newTaskStatus ?? undefined,
        labelIds: selectedLabelIds,
      } as Parameters<typeof taskService.create>[1]),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks', pid] });
      setNewTaskStatus(null);
      setSelectedLabelIds([]);
      reset();
    },
  });

  const closeMemberModal = () => {
    setAddMemberOpen(false);
    setMemberSearch('');
    setSelectedUserId(null);
    setAddMemberError(null);
  };

  const { mutate: addMember, isPending: addingMember } = useMutation({
    mutationFn: (userId: string) => projectService.addMember(pid, { userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['members', pid] });
      closeMemberModal();
    },
    onError: (err: unknown) => {
      setAddMemberError(err instanceof Error ? err.message : 'Failed to add member');
    },
  });

  const { mutate: removeMember } = useMutation({
    mutationFn: (userId: string) => projectService.removeMember(pid, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', pid] }),
  });

  const { mutate: changeMemberRole } = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      projectService.updateMemberRole(pid, userId, role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['members', pid] }),
  });

  const { mutate: archiveProject } = useMutation({
    mutationFn: () => projectService.update(pid, { status: 'ARCHIVED' }),
    onSuccess: () => navigate('/projects'),
  });

  if (projectLoading) return <PageSpinner />;
  if (!project) return <div className="p-6 text-gray-500">Project not found.</div>;

  const tasks = taskData?.tasks ?? [];
  const canManage = user?.role === 'ADMIN' || user?.role === 'TEAM_LEAD';

  // Users not already in project
  const existingMemberIds = new Set(members.map((m) => m.userId));
  const availableUsers = searchedUsers.filter((u) => !existingMemberIds.has(u.id));

  return (
    <div className="flex flex-col h-full">
      <Header
        title={project.name}
        subtitle={project.description || undefined}
        actions={
          <div className="flex items-center gap-2">
            <Badge variant={project.status} />
            {canManage && project.status === 'ACTIVE' && (
              <Button variant="secondary" size="sm" onClick={() => { if (confirm('Archive this project?')) archiveProject(); }}>
                Archive
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white px-6">
        <div className="flex gap-1">
          {(['board', 'members', 'activity'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-3 text-sm font-medium capitalize transition-colors border-b-2 ${
                tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Board */}
      {tab === 'board' && (
        <div className="flex-1 overflow-x-auto p-6">
          {tasksLoading ? <PageSpinner /> : (
            <div className="flex gap-4 min-w-max">
              {COLUMNS.map(({ status, label, color }) => {
                const col = tasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="w-72 shrink-0">
                    <div className={`rounded-xl border border-gray-200 bg-gray-50 border-t-4 ${color} overflow-hidden`}>
                      <div className="flex items-center justify-between px-4 py-3">
                        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
                        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-600">{col.length}</span>
                      </div>
                      <div className="p-3 space-y-2.5">
                        {col.map((t) => (
                          <TaskCard key={t.id} task={t} onClick={() => setSelectedTask(t)} />
                        ))}
                        {canManage && (
                          <button
                            onClick={() => setNewTaskStatus(status)}
                            className="w-full flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-white hover:text-indigo-600 transition-colors"
                          >
                            <Plus className="h-4 w-4" /> Add task
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Members */}
      {tab === 'members' && (
        <div className="p-6 max-w-2xl space-y-4">
          {canManage && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setAddMemberOpen(true)}>
                <Plus className="h-4 w-4" /> Add Member
              </Button>
            </div>
          )}
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {members.length === 0 ? (
              <p className="px-5 py-6 text-sm text-center text-gray-400">No members yet</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3.5">
                  <Avatar name={m.user?.name ?? '?'} size="md" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{m.user?.name}</p>
                    <p className="text-xs text-gray-400">{m.user?.email}</p>
                  </div>
                  <Badge variant={m.role === 'LEAD' ? 'TEAM_LEAD' : 'TEAM_MEMBER'}>
                    {m.role}
                  </Badge>
                  {canManage && m.userId !== user?.id && (
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={() => changeMemberRole({
                          userId: m.userId,
                          role: m.role === 'LEAD' ? 'MEMBER' : 'LEAD',
                        })}
                        title={m.role === 'LEAD' ? 'Demote to Member' : 'Promote to Lead'}
                        className={`rounded-md p-1 transition-colors ${
                          m.role === 'LEAD'
                            ? 'text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700'
                            : 'text-gray-400 hover:bg-indigo-50 hover:text-indigo-600'
                        }`}
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => { if (confirm('Remove member?')) removeMember(m.userId); }}
                        className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Activity */}
      {tab === 'activity' && (
        <div className="p-6 max-w-2xl">
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {(activityData?.logs ?? []).length === 0 ? (
              <p className="px-5 py-6 text-sm text-center text-gray-400">No activity yet</p>
            ) : (
              (activityData?.logs ?? []).map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3.5">
                  <Avatar name={log.user?.name ?? '?'} size="sm" className="mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">{log.user?.name}</span>{' '}
                      {log.action.toLowerCase().replace('_', ' ')} {log.targetType.toLowerCase()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {format(new Date(log.createdAt), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Create task modal */}
      <Modal
        isOpen={!!newTaskStatus}
        onClose={() => { setNewTaskStatus(null); setSelectedLabelIds([]); reset(); }}
        title={`New task · ${COLUMNS.find((c) => c.status === newTaskStatus)?.label ?? ''}`}
      >
        <form onSubmit={handleSubmit((d) => createTask(d))} className="space-y-4">
          <Input label="Title" placeholder="Task title" error={errors.title?.message} {...register('title')} />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Description</label>
            <textarea
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              rows={2}
              placeholder="Optional details..."
              {...register('description')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              options={[
                { value: 'LOW', label: 'Low' },
                { value: 'MEDIUM', label: 'Medium' },
                { value: 'HIGH', label: 'High' },
                { value: 'CRITICAL', label: 'Critical' },
              ]}
              {...register('priority')}
            />
            <Select
              label="Assign to"
              options={[
                { value: '', label: 'Unassigned' },
                ...members.map((m) => ({ value: m.userId, label: m.user?.name ?? m.userId })),
              ]}
              {...register('assignedTo')}
            />
          </div>
          <Input label="Due date" type="date" {...register('dueDate')} />
          {allLabels.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Labels</label>
              <div className="flex flex-wrap gap-2">
                {allLabels.map((label) => {
                  const active = selectedLabelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      onClick={() =>
                        setSelectedLabelIds((prev) =>
                          active ? prev.filter((id) => id !== label.id) : [...prev, label.id]
                        )
                      }
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-all ${
                        active ? 'border-transparent text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                      style={active ? { backgroundColor: label.color } : { borderColor: label.color + '66' }}
                    >
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: label.color }}
                      />
                      {label.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setNewTaskStatus(null); setSelectedLabelIds([]); reset(); }}>Cancel</Button>
            <Button type="submit" isLoading={creating}>Create Task</Button>
          </div>
        </form>
      </Modal>

      {/* Task detail modal */}
      {selectedTask && (
        <Modal
          isOpen
          onClose={() => setSelectedTask(null)}
          title={selectedTask.title}
          size="lg"
        >
          <TaskDetailModal
            task={selectedTask}
            projectId={pid}
            members={members}
            onClose={() => setSelectedTask(null)}
          />
        </Modal>
      )}

      {/* Add member modal */}
      <Modal isOpen={addMemberOpen} onClose={closeMemberModal} title="Add Member">
        <div className="space-y-3">
          {addMemberError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {addMemberError}
            </div>
          )}
          <input
            value={memberSearch}
            onChange={(e) => { setMemberSearch(e.target.value); setSelectedUserId(null); setAddMemberError(null); }}
            placeholder="Search by name or email..."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
          />
          <div className="max-h-52 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
            {availableUsers.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {memberSearch.trim().length === 0
                  ? 'Type a name or email to search'
                  : 'No users match your search'}
              </p>
            ) : (
              availableUsers.map((u) => {
                const selected = selectedUserId === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
                      selected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                      selected ? 'border-indigo-600 bg-indigo-600' : 'border-gray-300'
                    }`}>
                      {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <Avatar name={u.name} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{u.name}</p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                    <Badge variant={u.role} />
                  </button>
                );
              })
            )}
          </div>
          {!selectedUserId && memberSearch.trim().length > 0 && availableUsers.length > 0 && (
            <p className="text-xs text-amber-600">Select a user from the list above</p>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={closeMemberModal}>Cancel</Button>
            <Button
              isLoading={addingMember}
              disabled={!selectedUserId}
              onClick={() => selectedUserId && addMember(selectedUserId)}
            >
              Add Member
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
