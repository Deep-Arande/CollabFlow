/**
 * Demo seed — a realistic small-team snapshot to show the whole app off.
 *
 * Scope: structured data only (users, projects, memberships, labels, tasks,
 * comments/@mentions, activity feed). No document attachments or embeddings —
 * upload real docs through the UI to demo the Files tab and RAG Assistant.
 *
 * NON-DESTRUCTIVE + IDEMPOTENT: every demo row uses a stable `seed-*` id and is
 * upserted. Re-running updates the same demo rows (no duplicates) and never
 * deletes or touches any data you created yourself. Users are matched by email.
 *
 * Run with:  npm run prisma:seed
 * All demo users share the password below.
 */
import bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { env } from '../src/config/env';

// Direct (non-pooled) connection — safer for batch scripts than the pgbouncer pooler.
const pool = new Pool({ connectionString: env.DIRECT_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const PASSWORD = 'Password123!';

const now = Date.now();
const DAY = 86_400_000;
const daysAgo = (d: number) => new Date(now - d * DAY);
const hoursAgo = (h: number) => new Date(now - h * 3_600_000);
const daysFromNow = (d: number) => new Date(now + d * DAY);

type Role = 'LEAD' | 'MEMBER';
type Status = 'PENDING' | 'ACCEPTED' | 'DECLINED';
type TStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // ---- Users (matched by email so real accounts aren't duplicated) ----
  console.log('Upserting users…');
  const userDefs = [
    { key: 'alice', name: 'Alice Johnson', email: 'alice@collabflow.dev' },
    { key: 'bob', name: 'Bob Smith', email: 'bob@collabflow.dev' },
    { key: 'carol', name: 'Carol Lee', email: 'carol@collabflow.dev' },
    { key: 'dave', name: 'Dave Patel', email: 'dave@collabflow.dev' },
    { key: 'erin', name: 'Erin Davis', email: 'erin@collabflow.dev' },
    { key: 'frank', name: 'Frank Moore', email: 'frank@collabflow.dev' },
  ];
  const U: Record<string, { id: string; name: string }> = {};
  for (const u of userDefs) {
    const created = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name },
      create: { id: `seed-user-${u.key}`, name: u.name, email: u.email, passwordHash, createdAt: daysAgo(30) },
    });
    U[u.key] = { id: created.id, name: created.name };
  }

  // ---- Project builder ----
  interface MemberDef { key: string; role: Role; status: Status; respondedDaysAgo?: number; respondedHoursAgo?: number }
  interface TaskDef {
    key: string; title: string; description?: string; status: TStatus; priority: Priority;
    assignee?: string; labels?: string[]; createdDaysAgo: number; dueInDays?: number | null;
  }
  interface CommentDef { taskKey: string; author: string; content: string; mentions?: string[]; hoursAgo: number }

  const LABELS: { name: string; color: string }[] = [
    { name: 'Design', color: '#8B5CF6' },
    { name: 'Backend', color: '#3B82F6' },
    { name: 'Bug', color: '#EF4444' },
    { name: 'Urgent', color: '#F59E0B' },
    { name: 'Docs', color: '#10B981' },
  ];

  async function buildProject(cfg: {
    pid: string; name: string; description: string; leadKey: string; createdDaysAgo: number; dueInDays: number;
    members: MemberDef[]; tasks: TaskDef[]; comments: CommentDef[];
  }) {
    console.log(`Upserting project "${cfg.name}"…`);
    const { pid } = cfg;
    const createdAt = daysAgo(cfg.createdDaysAgo);
    let logSeq = 0;
    let cmtSeq = 0;

    // stable, namespaced activity-log upsert
    const log = (userKey: string, action: string, targetType: string, targetId: string, createdAt: Date, metadata: Record<string, unknown> = {}) => {
      const id = `${pid}-log-${++logSeq}`;
      return prisma.activityLog.upsert({
        where: { id },
        update: {},
        create: { id, projectId: pid, userId: U[userKey].id, action, targetType, targetId, metadata: metadata as Prisma.InputJsonValue, createdAt },
      });
    };

    await prisma.project.upsert({
      where: { id: pid },
      update: { name: cfg.name, description: cfg.description, dueDate: daysFromNow(cfg.dueInDays), status: 'ACTIVE' },
      create: {
        id: pid, name: cfg.name, description: cfg.description, dueDate: daysFromNow(cfg.dueInDays),
        createdBy: U[cfg.leadKey].id, createdAt, updatedAt: createdAt,
      },
    });
    await log(cfg.leadKey, 'PROJECT_CREATED', 'Project', pid, createdAt, { name: cfg.name });

    // Creator membership (LEAD, accepted at creation)
    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: pid, userId: U[cfg.leadKey].id } },
      update: { role: 'LEAD', status: 'ACCEPTED' },
      create: {
        id: `${pid}-mem-${cfg.leadKey}`, projectId: pid, userId: U[cfg.leadKey].id, role: 'LEAD',
        status: 'ACCEPTED', invitedBy: U[cfg.leadKey].id, addedAt: createdAt, respondedAt: createdAt,
      },
    });

    // Invited members
    for (const m of cfg.members) {
      const addedAt = daysAgo(cfg.createdDaysAgo - 0.5);
      const respondedAt =
        m.status === 'PENDING' ? null
          : m.respondedHoursAgo != null ? hoursAgo(m.respondedHoursAgo)
          : daysAgo(m.respondedDaysAgo ?? 1);
      await prisma.projectMember.upsert({
        where: { projectId_userId: { projectId: pid, userId: U[m.key].id } },
        update: { role: m.role, status: m.status, respondedAt },
        create: {
          id: `${pid}-mem-${m.key}`, projectId: pid, userId: U[m.key].id, role: m.role, status: m.status,
          invitedBy: U[cfg.leadKey].id, addedAt, respondedAt,
        },
      });
      await log(cfg.leadKey, 'MEMBER_INVITED', 'User', U[m.key].id, addedAt, { name: U[m.key].name });
      if (m.status === 'ACCEPTED') await log(m.key, 'INVITE_ACCEPTED', 'User', U[m.key].id, respondedAt!, {});
      else if (m.status === 'DECLINED') await log(m.key, 'INVITE_DECLINED', 'User', U[m.key].id, respondedAt!, {});
    }

    // Labels
    const L: Record<string, string> = {};
    for (const l of LABELS) {
      const lid = `${pid}-label-${l.name}`;
      await prisma.label.upsert({
        where: { id: lid },
        update: { name: l.name, color: l.color },
        create: { id: lid, projectId: pid, name: l.name, color: l.color },
      });
      L[l.name] = lid;
    }

    // Tasks
    const T: Record<string, string> = {};
    for (const t of cfg.tasks) {
      const tid = `${pid}-task-${t.key}`;
      const tCreated = daysAgo(t.createdDaysAgo);
      const tUpdated = t.status === 'TODO' ? tCreated : daysAgo(Math.max(0, t.createdDaysAgo - 1));
      const dueDate = t.dueInDays == null ? null : daysFromNow(t.dueInDays);
      const assignedTo = t.assignee ? U[t.assignee].id : null;
      await prisma.task.upsert({
        where: { id: tid },
        update: { title: t.title, description: t.description ?? '', priority: t.priority, status: t.status, dueDate, assignedTo, updatedAt: tUpdated },
        create: {
          id: tid, projectId: pid, title: t.title, description: t.description ?? '', priority: t.priority,
          status: t.status, dueDate, assignedTo, createdBy: U[cfg.leadKey].id, createdAt: tCreated, updatedAt: tUpdated,
        },
      });
      // Reset only THIS task's label links, then re-create (touches nothing else).
      await prisma.taskLabel.deleteMany({ where: { taskId: tid } });
      if (t.labels?.length) {
        await prisma.taskLabel.createMany({
          data: t.labels.map((name) => ({ taskId: tid, labelId: L[name] })),
          skipDuplicates: true,
        });
      }
      T[t.key] = tid;
      await log(cfg.leadKey, 'TASK_CREATED', 'Task', tid, tCreated, { title: t.title });
      if (t.status !== 'TODO') {
        await log(t.assignee ?? cfg.leadKey, 'TASK_STATUS_CHANGED', 'Task', tid, tUpdated, { from: 'TODO', to: t.status });
      }
    }

    // Comments (+ @mentions)
    for (const c of cfg.comments) {
      const cid = `${pid}-cmt-${++cmtSeq}`;
      const cCreated = hoursAgo(c.hoursAgo);
      await prisma.comment.upsert({
        where: { id: cid },
        update: { content: c.content, updatedAt: cCreated },
        create: { id: cid, taskId: T[c.taskKey], authorId: U[c.author].id, content: c.content, createdAt: cCreated, updatedAt: cCreated },
      });
      // Reset only THIS comment's mentions, then re-create.
      await prisma.commentMention.deleteMany({ where: { commentId: cid } });
      if (c.mentions?.length) {
        await prisma.commentMention.createMany({
          data: c.mentions.map((mk, j) => ({ id: `${cid}-mnt-${j}`, commentId: cid, mentionedUserId: U[mk].id })),
          skipDuplicates: true,
        });
      }
      await log(c.author, 'COMMENT_ADDED', 'Comment', cid, cCreated, { taskId: T[c.taskKey] });
    }
  }

  // ============================ PROJECT 1 ============================
  await buildProject({
    pid: 'seed-proj-website',
    name: 'Website Redesign',
    description: 'Rebuild the marketing site with a new design system, faster pages, and accessible components.',
    leadKey: 'alice', createdDaysAgo: 10, dueInDays: 20,
    members: [
      { key: 'bob', role: 'MEMBER', status: 'ACCEPTED', respondedDaysAgo: 9 },
      { key: 'carol', role: 'MEMBER', status: 'ACCEPTED', respondedDaysAgo: 8 },
      { key: 'dave', role: 'MEMBER', status: 'PENDING' }, // demo: pending invite
    ],
    tasks: [
      { key: 'w1', title: 'Audit current site performance', status: 'COMPLETED', priority: 'HIGH', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 9 },
      { key: 'w2', title: 'Wireframe new homepage', status: 'COMPLETED', priority: 'MEDIUM', assignee: 'carol', labels: ['Design'], createdDaysAgo: 9 },
      { key: 'w3', title: 'Design system & color palette', description: 'Tokens, spacing scale, component variants.', status: 'IN_PROGRESS', priority: 'HIGH', assignee: 'carol', labels: ['Design', 'Docs'], createdDaysAgo: 7, dueInDays: 3 },
      { key: 'w4', title: 'Rebuild header component', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 6, dueInDays: 5 },
      { key: 'w5', title: 'Migrate blog to new CMS', status: 'TODO', priority: 'MEDIUM', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 5, dueInDays: 10 },
      { key: 'w6', title: 'Fix mobile nav overlap', status: 'REVIEW', priority: 'HIGH', assignee: 'carol', labels: ['Bug', 'Design'], createdDaysAgo: 4, dueInDays: 1 },
      { key: 'w7', title: 'Accessibility pass (WCAG AA)', status: 'TODO', priority: 'HIGH', assignee: 'alice', labels: ['Docs'], createdDaysAgo: 4, dueInDays: 12 },
      { key: 'w8', title: 'Homepage copy final draft', status: 'IN_PROGRESS', priority: 'MEDIUM', labels: ['Docs'], createdDaysAgo: 3, dueInDays: -1 }, // overdue, unassigned
      { key: 'w9', title: 'Set up analytics events', status: 'TODO', priority: 'LOW', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 3, dueInDays: 8 },
      { key: 'w10', title: 'SEO metadata cleanup', status: 'TODO', priority: 'LOW', assignee: 'carol', labels: ['Docs'], createdDaysAgo: 2, dueInDays: null },
      { key: 'w11', title: 'Launch checklist', status: 'TODO', priority: 'CRITICAL', assignee: 'alice', labels: ['Urgent'], createdDaysAgo: 2, dueInDays: 18 },
      { key: 'w12', title: 'Broken footer links', status: 'REVIEW', priority: 'HIGH', assignee: 'bob', labels: ['Bug'], createdDaysAgo: 1, dueInDays: -3 }, // overdue
    ],
    comments: [
      { taskKey: 'w3', author: 'carol', content: 'First pass of the palette is up. @AliceJohnson can you sign off on the primary indigo?', mentions: ['alice'], hoursAgo: 30 },
      { taskKey: 'w3', author: 'alice', content: 'Looks great, approved. Lock the tokens.', hoursAgo: 26 },
      { taskKey: 'w6', author: 'carol', content: 'Reproduced on iPhone SE only. @BobSmith it may be the sticky header z-index.', mentions: ['bob'], hoursAgo: 20 },
      { taskKey: 'w6', author: 'bob', content: 'Good catch, pushing a fix for review now.', hoursAgo: 18 },
      { taskKey: 'w8', author: 'alice', content: 'This copy is overdue — anyone free to pick it up today?', hoursAgo: 10 },
      { taskKey: 'w4', author: 'bob', content: 'Header rebuild is 80% there, just the mobile breakpoint left.', hoursAgo: 8 },
      { taskKey: 'w12', author: 'bob', content: 'Footer links point to the old blog paths. @CarolLee do you have the new URL map?', mentions: ['carol'], hoursAgo: 5 },
      { taskKey: 'w11', author: 'alice', content: 'Started the launch checklist — will tag owners per section.', hoursAgo: 3 },
    ],
  });

  // ============================ PROJECT 2 ============================
  await buildProject({
    pid: 'seed-proj-mobile',
    name: 'Mobile App Launch',
    description: 'Ship the v1 iOS/Android app: auth, onboarding, push, and store presence.',
    leadKey: 'bob', createdDaysAgo: 8, dueInDays: 35,
    members: [
      { key: 'alice', role: 'MEMBER', status: 'ACCEPTED', respondedDaysAgo: 7 },
      { key: 'erin', role: 'MEMBER', status: 'ACCEPTED', respondedHoursAgo: 1 }, // fresh join -> assistant welcome hint
      { key: 'frank', role: 'MEMBER', status: 'DECLINED', respondedDaysAgo: 6 },
    ],
    tasks: [
      { key: 'm1', title: 'Define MVP feature set', status: 'COMPLETED', priority: 'HIGH', assignee: 'alice', labels: ['Docs'], createdDaysAgo: 7 },
      { key: 'm2', title: 'Set up CI/CD pipeline', status: 'COMPLETED', priority: 'MEDIUM', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 7 },
      { key: 'm3', title: 'Auth flow (login/register)', status: 'IN_PROGRESS', priority: 'HIGH', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 6, dueInDays: 6 },
      { key: 'm4', title: 'Onboarding screens', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'erin', labels: ['Design'], createdDaysAgo: 3, dueInDays: 9 },
      { key: 'm5', title: 'Push notifications', status: 'TODO', priority: 'MEDIUM', assignee: 'alice', labels: ['Backend'], createdDaysAgo: 3, dueInDays: 14 },
      { key: 'm6', title: 'Crash on cold start (Android)', status: 'REVIEW', priority: 'CRITICAL', assignee: 'bob', labels: ['Bug', 'Urgent'], createdDaysAgo: 2, dueInDays: -1 }, // overdue
      { key: 'm7', title: 'App store assets', status: 'TODO', priority: 'LOW', assignee: 'erin', labels: ['Design', 'Docs'], createdDaysAgo: 2, dueInDays: 20 },
      { key: 'm8', title: 'Offline mode caching', status: 'TODO', priority: 'HIGH', assignee: 'alice', labels: ['Backend'], createdDaysAgo: 2, dueInDays: 18 },
      { key: 'm9', title: 'Beta tester recruitment', status: 'TODO', priority: 'LOW', labels: ['Docs'], createdDaysAgo: 1, dueInDays: null }, // unassigned
      { key: 'm10', title: 'Privacy policy review', status: 'TODO', priority: 'MEDIUM', assignee: 'erin', labels: ['Docs', 'Urgent'], createdDaysAgo: 1, dueInDays: 5 },
      { key: 'm11', title: 'Performance profiling', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'bob', labels: ['Backend'], createdDaysAgo: 1, dueInDays: 7 },
    ],
    comments: [
      { taskKey: 'm3', author: 'bob', content: 'JWT refresh is out of scope for v1 per the brief. @AliceJohnson confirm?', mentions: ['alice'], hoursAgo: 22 },
      { taskKey: 'm3', author: 'alice', content: 'Confirmed, 7-day token is fine for launch.', hoursAgo: 20 },
      { taskKey: 'm6', author: 'bob', content: 'Only on Android 13. Looks like a null service init — fix in review.', hoursAgo: 6 },
      { taskKey: 'm4', author: 'erin', content: 'First onboarding screens are in Figma, will hand off to dev tomorrow.', hoursAgo: 2 },
      { taskKey: 'm10', author: 'erin', content: '@BobSmith who owns the legal sign-off on this one?', mentions: ['bob'], hoursAgo: 1 },
    ],
  });

  // ============================ PROJECT 3 ============================
  await buildProject({
    pid: 'seed-proj-marketing',
    name: 'Q3 Marketing Campaign',
    description: 'Plan and launch the Q3 growth campaign: landing page, email, ads, and social.',
    leadKey: 'carol', createdDaysAgo: 4, dueInDays: 15,
    members: [
      { key: 'dave', role: 'MEMBER', status: 'ACCEPTED', respondedDaysAgo: 3 },
      { key: 'erin', role: 'MEMBER', status: 'ACCEPTED', respondedDaysAgo: 3 },
    ],
    tasks: [
      { key: 'q1', title: 'Campaign brief & goals', status: 'COMPLETED', priority: 'HIGH', assignee: 'carol', labels: ['Docs'], createdDaysAgo: 4 },
      { key: 'q2', title: 'Landing page draft', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'dave', labels: ['Design'], createdDaysAgo: 3, dueInDays: 4 },
      { key: 'q3', title: 'Email sequence copy', status: 'IN_PROGRESS', priority: 'MEDIUM', assignee: 'erin', labels: ['Docs'], createdDaysAgo: 3, dueInDays: 6 },
      { key: 'q4', title: 'Social media calendar', status: 'TODO', priority: 'LOW', assignee: 'dave', labels: ['Docs'], createdDaysAgo: 2, dueInDays: 8 },
      { key: 'q5', title: 'Ad creative concepts', status: 'REVIEW', priority: 'MEDIUM', assignee: 'erin', labels: ['Design'], createdDaysAgo: 2, dueInDays: 2 },
      { key: 'q6', title: 'Budget approval', status: 'TODO', priority: 'CRITICAL', assignee: 'carol', labels: ['Urgent'], createdDaysAgo: 2, dueInDays: -1 }, // overdue
      { key: 'q7', title: 'Influencer outreach list', status: 'TODO', priority: 'LOW', assignee: 'dave', labels: ['Docs'], createdDaysAgo: 1, dueInDays: 10 },
      { key: 'q8', title: 'Analytics dashboard setup', status: 'TODO', priority: 'MEDIUM', assignee: 'erin', labels: ['Backend'], createdDaysAgo: 1, dueInDays: 7 },
      { key: 'q9', title: 'A/B test plan', status: 'TODO', priority: 'LOW', labels: ['Docs'], createdDaysAgo: 1, dueInDays: null }, // unassigned
      { key: 'q10', title: 'Press release', status: 'TODO', priority: 'MEDIUM', assignee: 'carol', labels: ['Docs', 'Urgent'], createdDaysAgo: 0.5, dueInDays: 3 },
    ],
    comments: [
      { taskKey: 'q2', author: 'dave', content: 'Landing hero is drafted. @CarolLee want the testimonial section above or below the fold?', mentions: ['carol'], hoursAgo: 14 },
      { taskKey: 'q2', author: 'carol', content: 'Above the fold — social proof early.', hoursAgo: 12 },
      { taskKey: 'q5', author: 'erin', content: 'Three ad concepts ready for review.', hoursAgo: 6 },
      { taskKey: 'q6', author: 'carol', content: 'Budget is stuck pending finance. Flagging as overdue.', hoursAgo: 4 },
      { taskKey: 'q3', author: 'erin', content: '@DavePatel can you supply the product screenshots for email #2?', mentions: ['dave'], hoursAgo: 2 },
    ],
  });

  // ---- Summary (seed rows only) ----
  const [projects, tasks, comments, mentions, logs] = await Promise.all([
    prisma.project.count({ where: { id: { startsWith: 'seed-proj-' } } }),
    prisma.task.count({ where: { id: { startsWith: 'seed-proj-' } } }),
    prisma.comment.count({ where: { id: { startsWith: 'seed-proj-' } } }),
    prisma.commentMention.count({ where: { id: { startsWith: 'seed-proj-' } } }),
    prisma.activityLog.count({ where: { id: { startsWith: 'seed-proj-' } } }),
  ]);
  console.log('\nSeed complete (existing data left untouched):');
  console.table({ demoUsers: userDefs.length, demoProjects: projects, demoTasks: tasks, demoComments: comments, demoMentions: mentions, demoActivityLogs: logs });
  console.log(`\nAll demo users log in with password: ${PASSWORD}`);
  console.log('Highlights: pending invite (Dave→Website Redesign), fresh join (Erin→Mobile App), overdue tasks in every project.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
