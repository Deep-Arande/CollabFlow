import { prisma } from './prisma.service';

// Builds the plain-text context blocks the AI features feed to Gemini. Everything
// here is scoped to a single projectId — callers must verify ACCEPTED membership
// before calling. No document content is included (that comes via RAG separately).

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Turn an ActivityLog row into a readable phrase.
function describeActivity(log: {
  action: string;
  metadata: unknown;
  user?: { name: string } | null;
}): string {
  const actor = log.user?.name ?? 'Someone';
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  switch (log.action) {
    case 'TASK_CREATED':
      return `${actor} created a task`;
    case 'TASK_UPDATED':
      return `${actor} updated a task`;
    case 'TASK_STATUS_CHANGED':
      return `${actor} moved a task ${meta.from ?? '?'} → ${meta.to ?? '?'}`;
    case 'TASK_DELETED':
      return `${actor} deleted a task`;
    case 'COMMENT_ADDED':
      return `${actor} commented on a task`;
    case 'ATTACHMENT_UPLOADED':
      return `${actor} uploaded a file${meta.fileName ? ` (${meta.fileName})` : ''}`;
    case 'MEMBER_INVITED':
      return `${actor} invited a member`;
    case 'INVITE_ACCEPTED':
      return `${actor} joined the project`;
    case 'MEMBER_LEFT':
      return `${actor} left the project`;
    case 'MEMBER_REMOVED':
      return `${actor} removed a member`;
    case 'PROJECT_UPDATED':
      return `${actor} updated the project`;
    case 'PROJECT_ARCHIVED':
      return `${actor} archived the project`;
    case 'PROJECT_CREATED':
      return `${actor} created the project`;
    default:
      return `${actor} — ${log.action}`;
  }
}

async function recentActivityLines(projectId: string, cap = 50): Promise<string[]> {
  const since = new Date(Date.now() - SEVEN_DAYS_MS);
  const logs = await prisma.activityLog.findMany({
    where: { projectId, createdAt: { gte: since } },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: cap,
  });
  return logs.map((l) => `- ${describeActivity(l)} (${relativeTime(l.createdAt)})`);
}

// -------- Feature 1: Catch Me Up context --------
export async function buildCatchMeUpContext(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) throw new Error('Project not found');

  const [statusGroups, overdue, activityLines, comments] = await Promise.all([
    prisma.task.groupBy({ by: ['status'], where: { projectId }, _count: true }),
    prisma.task.findMany({
      where: { projectId, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } },
      include: { assignee: { select: { name: true } } },
      orderBy: { dueDate: 'asc' },
    }),
    recentActivityLines(projectId, 50),
    prisma.comment.findMany({
      where: {
        task: { projectId },
        createdAt: { gte: new Date(Date.now() - SEVEN_DAYS_MS) },
      },
      include: { author: { select: { name: true } }, task: { select: { title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of statusGroups) counts[g.status] = g._count;

  const overdueLines = overdue.map((t) => {
    const days = t.dueDate
      ? Math.floor((Date.now() - t.dueDate.getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const who = t.assignee?.name ?? 'Unassigned';
    return `- "${t.title}" — ${who}, ${days}d overdue`;
  });

  const commentLines = comments.map(
    (c) => `- ${c.author?.name ?? 'Someone'} on "${c.task?.title ?? 'a task'}": "${c.content}"`,
  );

  return [
    `PROJECT: ${project.name}`,
    `CURRENT STATUS: ${counts.TODO ?? 0} Todo, ${counts.IN_PROGRESS ?? 0} In Progress, ${counts.REVIEW ?? 0} Review, ${counts.COMPLETED ?? 0} Completed`,
    `OVERDUE TASKS:${overdueLines.length ? '\n' + overdueLines.join('\n') : ' none'}`,
    '',
    `RECENT ACTIVITY (last 7 days):${activityLines.length ? '\n' + activityLines.join('\n') : ' none'}`,
    '',
    `RECENT COMMENTS:${commentLines.length ? '\n' + commentLines.join('\n') : ' none'}`,
  ].join('\n');
}

// -------- Feature 5: Project Assistant structured context --------
export async function buildProjectContext(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true },
  });
  if (!project) throw new Error('Project not found');

  const [members, tasks, activityLines] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId, status: 'ACCEPTED' },
      include: { user: { select: { name: true } } },
    }),
    prisma.task.findMany({
      where: { projectId },
      include: {
        assignee: { select: { name: true } },
        labels: { include: { label: { select: { name: true } } } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    recentActivityLines(projectId, 50),
  ]);

  const memberLines = members.map((m) => `- ${m.user?.name ?? 'Unknown'} (${m.role})`);

  const taskLines = tasks.map((t) => {
    const who = t.assignee?.name ?? 'Unassigned';
    const due = t.dueDate ? t.dueDate.toISOString().slice(0, 10) : 'no due date';
    const labels = t.labels.map((l) => l.label.name).join(', ') || 'none';
    return `- "${t.title}" [${t.status}, ${t.priority}] — ${who}, due ${due}, labels: ${labels}`;
  });

  return [
    `PROJECT: ${project.name}`,
    `DESCRIPTION: ${project.description || '(none)'}`,
    '',
    `MEMBERS:${memberLines.length ? '\n' + memberLines.join('\n') : ' none'}`,
    '',
    `TASKS (up to 50):${taskLines.length ? '\n' + taskLines.join('\n') : ' none'}`,
    '',
    `RECENT ACTIVITY (last 7 days):${activityLines.length ? '\n' + activityLines.join('\n') : ' none'}`,
  ].join('\n');
}
