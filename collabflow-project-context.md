# CollabFlow — Team Task & Project Collaboration Portal
### Full Project Context (for AI coding agent / developer reference)

---

## 0. About This Document

This file originally captured pre-build planning decisions. The project has since gone through an **architectural change** (see git history: `architectural-change` branch merge) that replaced the original global-role RBAC model with a project-scoped invite/accept model. This revision brings the document back in line with what `server/prisma/schema.prisma` and the controllers actually implement. Sections that describe superseded designs are marked; the rest still reflects current decisions.

---

## 1. Project Overview

**Name:** CollabFlow
**Type:** Team Task & Project Collaboration Portal (full-stack web app)
**Purpose:** A real-time, project-aware task management tool that gives teams live visibility into who's doing what, so status updates and reporting happen automatically instead of through manual check-ins.

### Problem it solves
- Task visibility is scattered across tools (Slack, spreadsheets, email)
- Status updates require manually chasing people
- Collaboration context (comments, files, decisions) gets lost across tools
- No real-time awareness of changes — everything is "check and refresh"
- Reporting is manual and after-the-fact

### One-line pitch
"CollabFlow is a real-time project collaboration tool that gives teams live visibility into who's doing what, so status updates and reporting happen automatically instead of through manual check-ins."

### Deployment goal
This is being built as a **live interview demo project** — must be deployed, polished, seeded with realistic data, and stable enough to demo live (e.g., two browser tabs showing real-time sync).

---

## 2. Access Model — Project-Scoped, No Account Roles

**Superseded:** the original design had a global `User.role` (`ADMIN` / `TEAM_LEAD` / `TEAM_MEMBER`) with an org-wide Admin tier. That was removed. `User` in `schema.prisma` has **no `role` column at all** — every account is the same kind of account.

All access control now lives entirely on `ProjectMember`:

```
ProjectMember {
  role:       LEAD | MEMBER          -- this user's role on THIS project only
  status:     PENDING | ACCEPTED | DECLINED
  invitedBy:  User.id
  respondedAt: DateTime?
}
```

### 🟡 Project Lead (`role: LEAD` on a given project)
- Create projects (creator is auto-added as `LEAD`, `status: ACCEPTED`)
- Edit / archive / delete **that** project
- Invite members (creates a `PENDING` membership — not instant access), change a member's project role, remove members
- Create / edit / delete tasks in that project
- Delete any comment or attachment in that project (not just their own)
- **Any authenticated user can create a project** — there's no gate on who is "allowed" to become a Lead; you become one by creating or being promoted on a project

### 🟢 Project Member (`role: MEMBER` on a given project)
- View the project once their membership is `ACCEPTED`
- Update the status of tasks assigned to them (their board-column-move permission)
- Comment on tasks, `@mention` other project members, manage labels
- Upload attachments to tasks
- Cannot create/edit/delete tasks, cannot manage other members

**A single user can be LEAD on one project and MEMBER on another** — role is per-project, not global. There is no admin account, no org-wide analytics view, and no unfiltered audit log across the whole system.

### Invite / Accept flow (new — not in the original design)
Adding someone to a project does not grant access. It creates a `PENDING` `ProjectMember` row. The invited user sees it under `GET /invites/pending` and must respond via `PATCH /invites/:membershipId/respond` with `ACCEPTED` or `DECLINED` before they can see the project. Re-inviting a `DECLINED` user resets the same row back to `PENDING` (no duplicate rows).

### Enforcement model
Two-layer check, same principle as before but reworked around project scope instead of account role:
1. **Project role** (`requireProjectLead` middleware) — LEAD-only actions within a project
2. **Membership** (`requireProjectMember` middleware) — must have an `ACCEPTED` row on the project in the URL at all

"Reports" and "Activity" (the org-facing views) are scoped to **projects the current user leads** — computed the same way for every user, since there's no role to branch on:

```sql
-- Reports / Activity, for ANY user (no ADMIN/TEAM_LEAD/TEAM_MEMBER branching):
SELECT ... FROM tasks WHERE projectId IN (
  SELECT projectId FROM ProjectMember WHERE userId = currentUserId AND role = 'LEAD' AND status = 'ACCEPTED'
)
```

Dashboard is the exception — it's scoped to **all projects the user belongs to** (any role, accepted), plus tasks assigned to them personally. See `api-contract.md` → Dashboard for exact fields.

---

## 3. Modules / Features (current state)

1. **Authentication**
   - Register, Login — JWT only, **no refresh token** (7-day expiry, stateless, no server-side session)
   - Accounts have no role field
   - Email verification & forgot/reset password: still deferred

2. **Dashboard**
   - `totalProjects`, `activeTasks`, `completedTasks`, `overdueTasksCount`, `myTasks`, `overdueTasks`, `recentActivity` — one flat shape for every user
   - Interactive, not just read-only: "My Tasks" rows and "Recent Activity" entries deep-link to the exact task (via `/projects/:id/tasks/:taskId`) where the underlying `targetType` is `Task`; "Total Projects" links to `/projects`; the "Overdue" stat card expands an inline list (`overdueTasks`, capped at 10, spans every project the user belongs to — not just tasks assigned to them, unlike `myTasks`) instead of just showing a number
   - No charts implemented yet (see Section 10)

3. **Projects**
   - Create / Edit / Archive / Delete (Lead-only past creation)
   - Invite members by searching existing users → `PENDING` membership → invitee accepts/declines
   - Change a member's project role, remove a member, leave a project (blocked if sole Lead)
   - Description, Due Date (required on Project; optional on Task)

4. **Task Management**
   - Fields: Title, Description, Priority, Status, Due Date (optional), Assigned User, Attachments, Labels
   - Status flow: Todo → In Progress → Review → Completed
   - Status changes go through a dedicated endpoint (`PATCH .../status`) separate from general task edits
   - **Board UI is implemented as a status-based view driven by a dropdown/modal, not drag-and-drop** — no DnD library (`react-beautiful-dnd`, `@dnd-kit/*`, etc.) is installed in `client/package.json`. If "Kanban drag & drop" is demoed, that's still a build item, not a shipped feature.
   - Tasks are deep-linkable: `/projects/:projectId/tasks/:taskId` opens the project page with that task's modal already open (same route/component as `/projects/:projectId`, just with an extra param). The task modal's open/closed state is driven by the URL, so opening a task, using browser back, and pasting/sharing a task link all work correctly.

5. **Team Collaboration**
   - Comments — implemented, editable **only by the author** (no Lead override on edit; Lead override only applies to delete)
   - `@Mentions` — implemented without a notification layer, exactly as originally designed (see Section 5). A "Mentions" inbox page (`/mentions`, `mention.service.ts`) lists everywhere you've been mentioned, newest first, each linking straight to the task via the deep link above — closes what used to be a dead-end backend endpoint (`GET /mentions/me`) with no UI.
   - Activity Feed (powered by `ActivityLog`)

6. **File Upload**
   - PDF, Images (JPEG/PNG/GIF/WEBP), DOCX
   - Supabase Storage (private bucket), accessed only via backend-generated signed URLs (120s expiry)
   - Fully implemented, including client-side upload/delete/signed-URL-open (`ProjectDetailPage.tsx` → `TaskDetailModal`)

7. **Reports**
   - Backend endpoints exist (`/reports/overview`, `/reports/team-performance`, `/reports/export`) and are scoped to projects the user leads
   - `client/src/pages/ReportsPage.tsx` (route `/reports`) consumes all three: stat cards + priority bars, a team performance table, and a JSON export download. No chart or PDF library is installed (`recharts`, `chart.js`, `jspdf`, etc.) — priority breakdown is plain CSS bars, export is raw JSON rather than a formatted PDF.
   - The project picker on this page only lists projects where the caller's `myRole === 'LEAD'` (see `GET /projects`'s `myRole` field). This matters because the backend endpoints themselves validate `?projectId=` against the caller's led-project list and `403` otherwise — **this validation was missing in an earlier version** and let any authenticated user pull report data for a project they weren't even a member of by passing its id directly (an IDOR). Fixed in `report.controller.ts`'s three handlers; if you're touching that file again, keep the `projectIds.includes(projectId)` check intact.
   - Five stat cards now: Total, Completed, In Progress, Delayed, Completion Rate. `getOverview` gained an `inProgress` count (added alongside the existing `total`/`completed`/`delayed` counts in the same `Promise.all`, for consistency with those — deliberately not derived client-side from `export`, which loads via a separate query and would otherwise flash `0`). The first four cards are each clickable and toggle one shared drill-down panel (`statFilter` state) instead of four separate blocks; the list itself is still derived client-side from the already-fetched `export` payload's tasks (filtered by status), same pattern as the original Delayed-only list.
   - That drill-down panel also has a member filter `<select>`. It's populated from `GET /projects/:id/members` (one call per project in scope via `useQueries`, merged/deduped) rather than from `team-performance`'s per-assignee list, specifically so a member with **zero** matching tasks — most commonly the project's own Lead — still shows up as a filter option instead of only members who already have an assigned task.
   - Beyond the stat cards, the page also renders: a 7-day completion trend bar chart (from `overview.dailyCompleted`, previously fetched but unused), and — only when viewing "All projects I lead" with more than one led project — a per-project comparison table (one `overview` call per led project via `useQueries`) so a multi-project Lead can see which specific project is behind instead of one blended number.

8. **Real-Time (Socket.io)**
   - `task:created`, `task:assigned`, `task:status_changed`, `comment:new` — all implemented, room-scoped to `project:{projectId}`
   - Socket join is **not membership-checked server-side** — any authenticated socket can join any project room by id. Fine for a demo, worth knowing before treating it as a security boundary.
   - No socket event for invites — those are activity-log only

---

## 4. Database Tables & Relations (matches `server/prisma/schema.prisma`)

### `User`
```
id            String (PK, uuid)
name          String
email         String (unique)
passwordHash  String
avatarUrl     String? (optional)
isActive      Boolean (default true)
createdAt     DateTime
updatedAt     DateTime
```
No `role` field. Deactivating a user (`isActive: false`) blocks login, but **there is no API endpoint that sets it** — no admin exists to flip it. It can currently only be changed directly in the database.

### `Project`
```
id           String (PK, uuid)
name         String
description  String (default "")
dueDate      DateTime            -- required
status       Enum (ACTIVE, ARCHIVED)
createdBy    String → FK User.id
createdAt    DateTime
updatedAt    DateTime
```

### `ProjectMember` (join table + invite state machine)
```
id          String (PK, uuid)
projectId   String → FK Project.id (cascade delete)
userId      String → FK User.id (cascade delete)
role        Enum (LEAD, MEMBER)       -- default MEMBER
status      Enum (PENDING, ACCEPTED, DECLINED)  -- default PENDING
invitedBy   String → FK User.id
addedAt     DateTime
respondedAt DateTime?

@@unique([projectId, userId])   -- one row per (project, user) pair, ever
```
This is the entire access-control surface. There is no separate "Team" or "Invite" table — invite state lives directly on the membership row, and re-inviting a declined user reuses it rather than creating a new one.

### `Task`
```
id            String (PK, uuid)
projectId     String → FK Project.id (cascade delete)
title         String
description   String (default "")
priority      Enum (LOW, MEDIUM, HIGH, CRITICAL)  -- default MEDIUM
status        Enum (TODO, IN_PROGRESS, REVIEW, COMPLETED)  -- default TODO
dueDate       DateTime?          -- optional (differs from Project.dueDate)
assignedTo    String? → FK User.id
createdBy     String → FK User.id
createdAt     DateTime
updatedAt     DateTime
```

### `Label` + `TaskLabel` (many-to-many, project-scoped)
```
Label:
id         String (PK, uuid)
projectId  String → FK Project.id (cascade delete)   -- NOT global
name       String
color      String

TaskLabel (junction, composite PK):
taskId   String → FK Task.id (cascade delete)
labelId  String → FK Label.id (cascade delete)
```
**Superseded:** labels were originally planned as global/shared across all projects. They are now created per-project — a "Design" label in Project A is a different row than "Design" in Project B, and any accepted member (not just Leads) can create/edit/delete them.

### `Comment`
```
id        String (PK, uuid)
taskId    String → FK Task.id (cascade delete)
authorId  String → FK User.id
content   String   -- raw text, may contain @username inline
createdAt DateTime
updatedAt DateTime
```

### `CommentMention` (structural @mention tracking — see Section 5)
```
id                String (PK, uuid)
commentId         String → FK Comment.id (cascade delete)
mentionedUserId   String → FK User.id
```

### `Attachment`
```
id          String (PK, uuid)
taskId      String → FK Task.id (cascade delete)
uploadedBy  String → FK User.id
filePath    String   -- Supabase Storage path, NOT a public URL
fileType    Enum (PDF, IMAGE, DOCX)
fileName    String
createdAt   DateTime
```

### `ActivityLog` (event diary — powers Activity Feed + Reports scope)
```
id          String (PK, uuid)
projectId   String? → FK Project.id (nullable)
userId      String → FK User.id   -- who performed the action
action      String                -- e.g. "TASK_STATUS_CHANGED", "MEMBER_INVITED"
targetType  String                -- "Task" | "Project" | "Comment" | "Attachment"
targetId    String
metadata    Json (default {})
createdAt   DateTime
```
Written inside the same `prisma.$transaction` as the action it logs, so the log entry and the actual change never go out of sync. See `server/src/utils/activityLogger.ts`.

### `Notification` — still not built
Deferred, same as originally planned. `CommentMention` and `ActivityLog` inserts remain the intended trigger source if it's added later.

### Relations summary
```
User 1—* ProjectMember *—1 Project        (role + invite status live here)
Project 1—* Task
Project 1—* Label
Task 1—* Comment
Task 1—* Attachment
Task *—* Label (via TaskLabel)
Comment 1—* CommentMention *—1 User
User 1—* ActivityLog (as actor)
```

---

## 5. @Mentions — Implementation Without Notifications

Unchanged from the original design and matches the code:

1. **Frontend:** while typing a comment, detect `@` + characters, show a dropdown of matching project members.
2. **On submit:** save raw text in `Comment.content`. Parse for `@username` matches against the task's `ProjectMember` list and create one `CommentMention` row per match.
3. **On display:** render comments by replacing `@username` substrings with a styled chip, matched against that comment's real `CommentMention` records.
4. **"Mentions of me" view** (notification substitute): `GET /mentions/me` — join `CommentMention` → `Comment` → `Task`, filtered by `mentionedUserId = currentUser.id`, newest first, capped at 50.
5. **Future extension path:** unchanged — `CommentMention` inserts become the trigger source for a `Notification` row + Socket.io emit if/when built.

---

## 6. File Storage — Supabase Storage (Private Bucket)

Unchanged from the original design and fully implemented, both server and client side.

### Upload flow
1. Browser sends file to Express backend (multipart/form-data via `multer`, memory storage, 10 MB limit).
2. Backend uploads to Supabase Storage using the **service role key** (server-side only, in `server/.env` as `SUPABASE_SERVICE_KEY` — never exposed to the frontend).
3. Path structure actually used: `project-{projectId}/task-{taskId}/{uuid}.{ext}` (original doc suggested prefixing the bucket name and original filename — the shipped version doesn't keep the original filename in the path, only in `Attachment.fileName`).
4. Supabase returns a storage path (not a public URL) → saved in `Attachment.filePath`.

### Access/view flow (RBAC-gated)
1. Frontend requests `GET /api/tasks/:taskId/attachments/:id/url`.
2. Backend checks the caller has an `ACCEPTED` `ProjectMember` row on the task's project.
3. If authorized → backend asks Supabase for a signed URL (**120s** expiry, not the original 60–120s range — it's fixed at 120) → returned to frontend.
4. If not authorized → `403`, no signed URL ever generated.

**Key security point (unchanged):** the permission check happens on the Express backend, never on Supabase or the frontend.

---

## 7. Deferred / Not Yet Built

- Email verification & forgot/reset password flow
- Notification system (real-time toast/bell) — `CommentMention` + `ActivityLog` already lay the groundwork
- Calendar module (deadlines/meetings/milestones view)
- AI Features — all deferred (AI Task Generator, AI Comment Summary, AI Weekly Report, AI Priority Suggestion). Priority remains a plain manual dropdown.
- Multi-tenant `Organization` table — still N/A; access control is per-project now anyway, so this would layer on top rather than replace anything
- **Charts and PDF export** — the Reports page (see Section 3.7) now covers overview/team-performance/export, but with plain CSS bars and raw-JSON export, not a chart library or a formatted PDF
- **True Kanban drag-and-drop** — status changes work via API/UI action, not drag gestures (see Section 3.4)
- A user-facing way to reactivate/deactivate accounts (`isActive` has no endpoint at all now that there's no admin role)

---

## 8. Tech Stack

### Frontend
- React + TypeScript, Vite
- Tailwind CSS
- React Router (`react-router-dom` v6)
- TanStack Query (`@tanstack/react-query`)
- React Hook Form + Zod
- `date-fns`, `axios`, `lucide-react`, `socket.io-client`
- **No chart library and no drag-and-drop library installed yet** (see Section 7)

### Backend
- Node.js + Express.js (TypeScript)
- PostgreSQL via **Supabase**
- Prisma ORM
- JWT (`jsonwebtoken`) + Bcrypt (`bcryptjs`) — custom auth, no refresh tokens
- Socket.io (real-time: task status changes, comments, task assignment)
- `multer` (memory storage) for uploads

### Storage
- **Supabase Storage** (private bucket, signed URLs)

### Deployment
- Frontend → **Vercel**
- Backend → **Railway** (chosen for reliable persistent Socket.io/WebSocket support vs. Render's free-tier sleep behavior)
- Database → **Supabase** (Postgres)

### Supabase connection notes for Prisma
- Pooled connection string (port 6543, `?pgbouncer=true`) for the app's runtime `DATABASE_URL`
- Direct connection string (port 5432) for `prisma migrate` operations, as `DIRECT_URL`
- `schema.prisma`'s `datasource db` block in this repo does **not** currently declare `directUrl` — only `provider = "postgresql"` is set, with the URL supplied via `DATABASE_URL` env var at the Prisma Client level. If `prisma migrate` needs the direct (non-pooled) connection, confirm `DIRECT_URL` is wired before relying on it.
- Supabase's own Auth is intentionally unused — custom JWT/Bcrypt auth is kept as a technical talking point. Supabase is Postgres host + file storage only.

---

## 9. Folder Structure (actual)

```
client/
 └── src/
     ├── components/
     │   ├── layout/       (Header, Sidebar)
     │   └── ui/            (Avatar, Badge, Button, Input, Modal, Select, Spinner)
     ├── config/            (api.ts — axios instance)
     ├── context/           (AuthContext, SocketContext)
     ├── layouts/           (AppLayout, AuthLayout)
     ├── pages/
     │   ├── auth/           (LoginPage, RegisterPage)
     │   ├── invites/        (InvitesPage)
     │   ├── mentions/       (MentionsPage — "who @mentioned me", links to the deep-linked task route)
     │   ├── projects/       (ProjectsPage, ProjectDetailPage — includes Kanban-style task board, TaskDetailModal with comments/attachments/labels, reachable directly via /projects/:projectId/tasks/:taskId)
     │   ├── DashboardPage.tsx
     │   └── ReportsPage.tsx (Lead-only report view — stat cards, priority bars, team performance table, JSON export)
     ├── services/          (one per resource: auth, user, invite, project, task, label, comment, attachment, activity, dashboard, mention, report)
     └── types/index.ts     (single source of truth for shared TS types — matches Prisma schema closely)

server/
 └── src/
     ├── controllers/       (one per resource, incl. invite.controller.ts)
     ├── routes/
     ├── middleware/        (auth.middleware, rbac.middleware, upload.middleware)
     ├── services/          (prisma.service, storage.service, token.service)
     ├── sockets/
     ├── utils/             (apiResponse, asyncHandler, activityLogger, parseMentions)
     ├── config/            (env.ts)
     └── types.ts           (Express.Request augmentation: req.user, req.projectMembership)

server/prisma/
 ├── schema.prisma
 └── migrations/
```

Note: there is no `reports` service/page on the client yet, matching Section 7.

---

## 10. Extra "Stand Out" Features (status)

| Feature | Status |
|---|---|
| Dark Mode | Not confirmed implemented — check `Header`/theme context if needed |
| Search & Filters | Implemented for tasks (`status`, `priority`, `assignedTo`, `search` query params) and users (`/users/search`) |
| Activity Timeline | Implemented (`ActivityLog` + `/activity` endpoints) |
| Audit Logs | Endpoint exists (`/activity/audit`) but currently identical in scope to `/activity` — not a true unfiltered/org-wide view (no admin concept to grant one) |
| Responsive Design | Tailwind-based, not verified here |
| Pagination | Implemented on `/activity`, `/activity/audit`, `/activity/project/:id` (`page`/`limit`); not on `/projects` or `/tasks` list endpoints |
| Toast Notifications | Not confirmed — check `components/ui` |
| Keyboard Shortcuts | Not confirmed implemented |
| Export Reports (PDF/CSV) | Implemented as raw JSON download from the Reports page (`/reports/export`); no PDF/CSV formatting |
| Mentions Inbox | Implemented (`/mentions`) — was previously a backend-only endpoint with no UI |

---

## 11. Demo-Readiness Checklist (interview-specific requirements)

1. **Seed data script** — check whether one exists under `server/prisma/` before assuming it's ready; needs users, projects with mixed membership status (some `PENDING` invites are a good demo of that flow), tasks across statuses, comments/mentions/attachments.
2. **Handle Railway cold starts** — check current sleep/spin-down behavior before the interview.
3. **Loading states + error boundaries** on every fetch.
4. **Rehearsed demo script** should now route around the invite flow, e.g.: create project as User A (becomes Lead) → invite User B → log in as User B, accept invite in `/invites` → assign a task to User B → switch tabs to see `task:assigned`/`task:status_changed` in real time → comment with `@mention`.
5. **README with architecture overview** — the current `README.md` at the repo root still describes the old global-role model (`ADMIN`/`TEAM_LEAD`/`TEAM_MEMBER`, refresh tokens, admin analytics). It was **not** updated as part of this pass — flag it as a follow-up if the README needs to match this document and `api-contract.md`.

---

## 12. Suggested Build Order (historical — kept for reference)

1. Auth (register/login/JWT, no refresh) + project-scoped RBAC middleware
2. Prisma schema + Supabase connection + Projects/Tasks CRUD
3. Board UI for task status
4. Socket.io real-time (status change, comments, assignment)
5. Dashboard
6. File uploads via Supabase Storage (signed URL flow)
7. Reports backend + frontend, Mentions inbox, deep-linkable tasks (see Section 3)
8. Polish: dark mode, keyboard shortcuts, search/filters, pagination
9. (Future) Notifications, Calendar, AI features, true drag-and-drop Kanban, charts/PDF export

---

*This document was reconciled against the actual server implementation (`schema.prisma`, all controllers/routes/middleware) and the client (`types/index.ts`, services, `App.tsx` routes) as of this revision. Any new decisions should be appended here to keep a single source of truth.*
