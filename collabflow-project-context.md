# CollabFlow — Team Task & Project Collaboration Portal
### Full Project Context (for AI coding agent / developer reference)

---

## 1. Project Overview

**Name:** CollabFlow
**Type:** Team Task & Project Collaboration Portal (full-stack web app)
**Purpose:** A real-time, role-aware project management tool that gives teams live visibility into who's doing what, so status updates and reporting happen automatically instead of through manual check-ins.

### Problem it solves
- Task visibility is scattered across tools (Slack, spreadsheets, email)
- Status updates require manually chasing people
- Collaboration context (comments, files, decisions) gets lost across tools
- No real-time awareness of changes — everything is "check and refresh"
- Reporting is manual and after-the-fact
- Access control is often all-or-nothing on small teams

### One-line pitch
"CollabFlow is a real-time project collaboration tool that gives teams live visibility into who's doing what, so status updates and reporting happen automatically instead of through manual check-ins."

### Deployment goal
This is being built as a **live interview demo project** — must be deployed, polished, seeded with realistic data, and stable enough to demo live (e.g., two browser tabs showing real-time sync).

---

## 2. Roles & Scope

Single-tenant application (one organization = the whole app; no multi-tenant `Organization` table for v1).

### 🔴 Admin — org-wide scope
- Manage users (create/deactivate accounts, assign roles)
- Create teams (optional feature, see note in schema section)
- View **org-wide analytics** (across ALL projects/teams — completion rate, team productivity comparison, workload distribution) — exclusive to Admin
- Create/manage/delete/override any project
- Access audit logs (full ActivityLog, unfiltered)

### 🟡 Team Lead — project-scoped
- Create projects (becomes owner)
- Add members to their project by searching existing users (`ProjectMembers` table)
- Assign tasks to members within their own project(s)
- Edit/archive/delete only their own projects
- View **reports** scoped only to their project(s) — same data shape as Admin analytics but filtered by `projectId IN (their projects)`
- Cannot see other Leads' projects or org-wide totals
- Cannot grant Admin-level roles to anyone

### 🟢 Team Member — task-scoped
- View projects they are a member of
- Update status of tasks assigned to them (Kanban drag & drop)
- Comment on tasks, @mention other project members
- Upload attachments to tasks
- View personal dashboard (their tasks, deadlines, recent activity) — no team-wide or org-wide numbers

**Enforcement model (important architectural decision):**
Access control is a **two-layer check**, not just `role === 'ADMIN'`:
1. **Role** — what kind of actions this user type is allowed to perform
2. **Membership** — which specific projects/resources this particular user has access to (via `ProjectMembers`)

Analytics/reports use **one query pattern with scope changing by role**, not three separate features:
```
Admin:      SELECT ... FROM tasks                                    -- no filter
TeamLead:   SELECT ... FROM tasks WHERE projectId IN (ledProjectIds)
TeamMember: SELECT ... FROM tasks WHERE assignedUserId = currentUserId
```

---

## 3. Modules / Features (v1 scope — see Section 7 for deferred items)

1. **Authentication**
   - Register, Login, JWT + Refresh Token
   - RBAC middleware (role + project membership checks)
   - Email verification & forgot/reset password: **deferred to v2** (not built in v1; mention as roadmap item if asked)

2. **Dashboard** (role-scoped depth per Section 2)
   - My Tasks / Pending / Completed / Upcoming Deadlines / Recent Activity / Project Progress
   - Charts: Tasks Completed, Team Productivity, Weekly Progress (Chart.js or Recharts)

3. **Projects**
   - Create / Edit / Archive / Delete
   - Add members (from existing user list — searchable dropdown sourced from `User` table minus existing `ProjectMembers`)
   - Description, Due Date

4. **Task Management**
   - Fields: Title, Description, Priority, Status, Due Date, Assigned User, Attachments, Labels
   - Status flow: Todo → In Progress → Review → Completed
   - **Kanban board with drag & drop** (core standout feature — must work well for demo)

5. **Team Collaboration**
   - Comments
   - **@Mentions — implemented WITHOUT a notification layer (see Section 5 for full mechanism)**
   - Activity Feed (powered by `ActivityLog` table)

6. **File Upload**
   - PDF, Images, DOCX
   - **Storage: Supabase Storage (private bucket)** — NOT Cloudinary (changed from original plan)
   - Files accessed via backend-generated **signed URLs**, never public links

7. **Reports**
   - Completed Tasks, Productivity, Team Performance, Delayed Tasks
   - Export as PDF

8. **Real-Time (Socket.io)**
   - Instant notifications, new comment, task assigned, status changed
   - This is a key standout/demo feature — should be reliable and clearly demoable (e.g., two tabs open side by side)

---

## 4. Database Tables & Relations

### `User`
```
id            UUID (PK)
name          String
email         String (unique)
passwordHash  String
role          Enum (ADMIN, TEAM_LEAD, TEAM_MEMBER)
avatarUrl     String (optional)
isActive      Boolean (default true)
createdAt     DateTime
updatedAt     DateTime
```

### `Project`
```
id           UUID (PK)
name         String
description  String
dueDate      DateTime
status       Enum (ACTIVE, ARCHIVED)
createdBy    UUID → FK User.id   (owning Team Lead)
createdAt    DateTime
updatedAt    DateTime
```
*(Note: `Team`/`TeamMembers` tables are OPTIONAL and cut from v1 unless a grouping layer above Projects is specifically wanted — `ProjectMembers` alone covers "who's on this team" for the demo.)*

### `ProjectMembers` (join table — source of "available members to add/invite")
```
id         UUID (PK)
projectId  UUID → FK Project.id
userId     UUID → FK User.id
role       Enum (LEAD, MEMBER)   -- who leads THIS project
addedAt    DateTime
```

### `Task`
```
id            UUID (PK)
projectId     UUID → FK Project.id
title         String
description   String
priority      Enum (LOW, MEDIUM, HIGH, CRITICAL)
status        Enum (TODO, IN_PROGRESS, REVIEW, COMPLETED)
dueDate       DateTime
assignedTo    UUID → FK User.id (nullable)
createdBy     UUID → FK User.id
createdAt     DateTime
updatedAt     DateTime
```

### `Label` + `TaskLabels` (many-to-many)
```
Label:
id      UUID (PK)
name    String
color   String

TaskLabels (junction table):
taskId   UUID → FK Task.id
labelId  UUID → FK Label.id
```
*Reasoning: labels are reused across many tasks; a junction table avoids duplicating label name/color and keeps renaming/recoloring centralized.*

### `Comment`
```
id          UUID (PK)
taskId      UUID → FK Task.id
authorId    UUID → FK User.id
content     String   -- raw text, may contain @username inline
createdAt   DateTime
updatedAt   DateTime
```

### `CommentMention` (structural @mention tracking — see Section 5)
```
id                UUID (PK)
commentId         UUID → FK Comment.id
mentionedUserId   UUID → FK User.id
```

### `Attachment`
```
id          UUID (PK)
taskId      UUID → FK Task.id
uploadedBy  UUID → FK User.id
filePath    String   -- Supabase Storage path (NOT a public URL)
fileType    Enum (PDF, IMAGE, DOCX)
fileName    String
createdAt   DateTime
```

### `ActivityLog` (event diary — powers Activity Feed + Audit Logs)
```
id          UUID (PK)
projectId   UUID → FK Project.id (nullable — some events are org-level)
userId      UUID → FK User.id   -- who performed the action
action      String              -- e.g. "TASK_STATUS_CHANGED", "COMMENT_ADDED"
targetType  String              -- "Task" | "Project" | "Comment"
targetId    UUID
metadata    JSONB               -- flexible per-event detail, e.g. {from:"TODO", to:"IN_PROGRESS"}
createdAt   DateTime
```
*Reasoning for JSONB: different event types carry different extra details (status change needs from/to, comment needs commentId, assignment needs assignedTo). A single flexible metadata column avoids a wide table full of mostly-NULL fixed columns, and new event types never require a schema migration.*

Should be written inside the same transaction as the action it logs (e.g., `prisma.$transaction([updateTask, createActivityLog])`) so the log entry and the actual change never go out of sync.

### `Notification` — stubbed only, NOT built in v1
Deferred. When added later, it will be triggered directly off `CommentMention` and `ActivityLog` inserts — no schema rework needed for those two tables to support it.

### Relations summary
```
User 1—* ProjectMembers *—1 Project
Project 1—* Task
Task 1—* Comment
Task 1—* Attachment
Task *—* Label (via TaskLabels)
Comment 1—* CommentMention *—1 User
User 1—* ActivityLog (as actor)
```

---

## 5. @Mentions — Implementation Without Notifications

**Goal:** working, visible @mentions with zero dependency on a notification system.

1. **Frontend:** while typing a comment, detect `@` + characters, show dropdown of matching `ProjectMembers` for that task's project.
2. **On submit:** save raw text in `Comment.content`. Parse text for `@username` matches and create one `CommentMention` row per matched user (structural FK relationship, not just string matching).
3. **On display:** render comments by replacing `@username` substrings with a styled chip, matched against that comment's real `CommentMention` records (accurate even with similar usernames).
4. **"Mentions of me" view (notification substitute for now):**
   ```sql
   SELECT * FROM CommentMention
   JOIN Comment ON ...
   WHERE mentionedUserId = currentUser.id
   ORDER BY comment.createdAt DESC
   ```
   Gives users a real, functional way to check who tagged them — not real-time, but fully working.
5. **Future extension path:** when notifications are added later, `CommentMention` inserts become the trigger source for both a `Notification` row and a Socket.io emit — no schema changes needed.

---

## 6. File Storage — Supabase Storage (Private Bucket)

**Decision:** Use Supabase Storage instead of Cloudinary. Bucket name suggestion: `attachments`, set to **private**.

### Upload flow
1. User selects file in browser → sent to Express backend (multipart/form-data), not directly to Supabase.
2. Backend uploads to Supabase Storage using the **service role key** (server-side only — never exposed to frontend).
3. Suggested path structure:
   ```
   attachments/project-{projectId}/task-{taskId}/{uuid}-{originalFileName}
   ```
4. Supabase returns a storage path (not a public URL) → save in `Attachment.filePath`.

### Access/view flow (RBAC-gated)
1. Frontend requests: `GET /api/tasks/:taskId/attachments/:attachmentId`
2. Backend checks: is this user a member of the project this task belongs to (via `ProjectMembers`), or Admin?
3. If authorized → backend asks Supabase to generate a **signed URL** (short expiry, e.g. 60–120 seconds) → returns it to frontend, which loads/downloads directly from Supabase using that temporary link.
4. If not authorized → 403, no signed URL ever generated.

**Key security point:** the permission check happens on the Express backend, not on Supabase or the frontend. Supabase only knows "give signed URLs to whoever holds the service key and asks" — your backend is the sole gatekeeper deciding who's allowed to ask.

---

## 7. Deferred to v2 (explicitly out of scope for v1 build)

- Email verification & forgot/reset password flow
- Notification system (real-time toast/bell notifications) — `CommentMention` + `ActivityLog` already lay the groundwork
- Calendar module (deadlines/meetings/milestones view)
- AI Features — ALL deferred for now (AI Task Generator, AI Comment Summary, AI Weekly Report, AI Priority Suggestion). Priority field remains a plain manual dropdown (Low/Medium/High/Critical) for v1. Adding AI later = one new endpoint (`POST /api/ai/suggest-priority`) calling an LLM API — no schema rework needed.
- `Team`/`TeamMembers` grouping layer above Projects (optional, cut unless specifically needed)
- Multi-tenant `Organization` table (single-tenant is sufficient for demo; mention as extension path if asked)

---

## 8. Tech Stack

### Frontend
- React + TypeScript
- Tailwind CSS
- React Router
- React Query (TanStack Query)
- React Hook Form + Zod
- Chart.js or Recharts

### Backend
- Node.js + Express.js (TypeScript — `ts-node-dev` for dev, `tsc` build for production)
- PostgreSQL via **Supabase** (changed from Neon)
- Prisma ORM
- JWT Authentication + Bcrypt
- Socket.io (real-time: task status changes, comments, task assignment)

### Storage
- **Supabase Storage** (private bucket, signed URLs) — replaces Cloudinary

### Deployment
- Frontend → **Vercel**
- Backend → **Railway** (chosen over Render specifically because it handles persistent Socket.io/WebSocket connections more reliably and doesn't aggressively sleep on free tier the way Render does)
- Database → **Supabase** (Postgres)

### Supabase connection notes for Prisma
- Use the **pooled connection string** (port 6543, `?pgbouncer=true`) for the app's runtime `DATABASE_URL`
- Use the **direct connection string** (port 5432) for `prisma migrate` operations
- Keep Supabase's own Auth/Storage-as-auth-service unused — **custom JWT/Bcrypt auth is intentionally kept** rather than swapped for Supabase Auth, since building auth manually is a stronger technical talking point for this project. Supabase is used purely as Postgres host + file storage.

---

## 9. Folder Structure

```
client/
 ├── components/
 ├── pages/
 ├── hooks/
 ├── services/
 ├── context/
 ├── layouts/
 └── utils/

server/
 ├── src/
 │   ├── controllers/
 │   ├── routes/
 │   ├── middleware/
 │   ├── prisma/
 │   ├── services/
 │   ├── sockets/
 │   ├── utils/
 │   └── config/
```

---

## 10. Extra "Stand Out" Features (nice-to-have, lower priority than core)
- Dark Mode
- Search & Filters
- Activity Timeline (same data as ActivityLog, presented as a feed)
- Audit Logs (Admin-only, unfiltered ActivityLog view)
- Responsive Design
- Pagination
- Toast Notifications (UI-only toasts for local actions — distinct from the deferred real-time notification system)
- Keyboard Shortcuts (e.g. `N` = new task)
- Export Reports (PDF/CSV)

---

## 11. Demo-Readiness Checklist (interview-specific requirements)
1. **Seed data script** — 2–3 users per role, 2–3 projects, 15–20 tasks across different statuses, some comments/mentions/attachments. An empty app is a bad demo.
2. **Handle Railway cold starts** — check current sleep/spin-down behavior before the interview; consider a keep-alive ping or paid tier if needed.
3. **Loading states + error boundaries** on every fetch — no blank white screens.
4. **Rehearsed demo script**, e.g.: login as Lead → create task → assign → switch tab, login as Member → see notification arrive in real time → drag task across Kanban → comment with @mention → dashboard updates live.
5. **README with architecture overview** — schema diagram, auth flow explanation, rationale for Socket.io vs polling, RBAC two-layer check explanation.

---

## 12. Suggested Build Order
1. Auth (register/login/JWT/refresh, skip email verification) + RBAC middleware
2. Prisma schema + Supabase connection + Projects/Tasks CRUD (basic list view, no drag-drop yet)
3. Kanban board with drag & drop
4. Socket.io real-time (status change, comments) — auth-aware socket handshake, not just REST auth
5. Dashboard + charts (now real data exists)
6. File uploads via Supabase Storage (signed URL flow)
7. Reports + PDF export
8. Polish: dark mode, keyboard shortcuts, search/filters, pagination
9. (Future) Notifications, Calendar, AI features

---

*This document reflects all decisions made through project planning discussion as of the current session. Any new decisions should be appended here to keep a single source of truth for the AI coding agent.*
