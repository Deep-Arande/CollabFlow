# CollabFlow

A real-time team task and project collaboration portal. Gives teams live visibility into who's doing what — status updates and reporting happen automatically instead of through manual check-ins.

---

## Architecture Overview

```
client/   →  React + TypeScript (deployed on Vercel)
server/   →  Node.js + Express + TypeScript (deployed on Railway)
database  →  PostgreSQL via Supabase
storage   →  Supabase Storage (private bucket, signed URLs)
realtime  →  Socket.io
```

---

## Tech Stack

### Frontend
- React + TypeScript
- Tailwind CSS
- React Router
- TanStack Query (React Query)
- React Hook Form + Zod
- Recharts / Chart.js

### Backend
- Node.js + Express (TypeScript)
- Prisma ORM
- PostgreSQL (Supabase)
- Socket.io
- JWT + Bcrypt (custom auth — not Supabase Auth)

---

## Auth Flow

1. User registers → password hashed with Bcrypt → stored in `User` table
2. Login → server issues a short-lived **JWT access token** + long-lived **refresh token**
3. Every protected request sends the JWT in the `Authorization: Bearer` header
4. RBAC middleware checks **role** (ADMIN / TEAM_LEAD / TEAM_MEMBER) **and** project membership (`ProjectMembers` table) before allowing access

No Supabase Auth is used — auth is intentionally built from scratch as a technical talking point.

---

## RBAC — Two-Layer Access Control

Access control is enforced at two levels, not just role:

| Layer | What it checks |
|---|---|
| Role | What kind of actions this user type can perform |
| Membership | Which specific projects this user has access to (via `ProjectMembers`) |

Analytics and reports use one query pattern with scope changing by role:

```sql
-- Admin: org-wide
SELECT ... FROM tasks

-- Team Lead: their projects only
SELECT ... FROM tasks WHERE projectId IN (ledProjectIds)

-- Team Member: their tasks only
SELECT ... FROM tasks WHERE assignedTo = currentUserId
```

---

## Real-Time (Socket.io)

Socket.io powers live updates for:
- Task status changes (Kanban drag & drop)
- New comments
- Task assignment

The socket handshake is auth-aware — JWT is verified on connection, not just at REST endpoints.

Demo use case: open two browser tabs side by side. Changes in one tab appear instantly in the other.

---

## File Storage — Supabase Storage

Files are stored in a **private** Supabase Storage bucket. They are never publicly accessible.

**Upload flow:**
1. Browser sends file to Express backend (multipart/form-data)
2. Backend uploads to Supabase using the service role key (server-side only)
3. Storage path saved in `Attachment.filePath` — not a public URL

**Access flow:**
1. Frontend requests a file via `GET /api/tasks/:taskId/attachments/:attachmentId`
2. Backend checks project membership (via `ProjectMembers`) or Admin role
3. If authorized → backend generates a **signed URL** (60–120s expiry) → returned to frontend
4. Frontend loads/downloads directly from Supabase using the temporary link

---

## Database Connection (Supabase + Prisma)

Supabase provides two connection strings. Both are required:

```env
# Pooled — used by the app at runtime (goes through PgBouncer)
DATABASE_URL="postgresql://postgres:[password]@db.[ref].supabase.co:6543/postgres?pgbouncer=true"

# Direct — used by Prisma Migrate only (bypasses PgBouncer)
DIRECT_URL="postgresql://postgres:[password]@db.[ref].supabase.co:5432/postgres"
```

In `schema.prisma`:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## Roles

| Role | Scope |
|---|---|
| **Admin** | Org-wide — manage users, view all analytics, audit logs, override any project |
| **Team Lead** | Project-scoped — create projects, assign tasks, view reports for their projects |
| **Team Member** | Task-scoped — update assigned tasks, comment, upload attachments |

---

## Deployment

| Service | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Railway (chosen for reliable WebSocket support) |
| Database | Supabase |

---

## Local Development Setup

```bash
# Clone the repo
git clone <repo-url>
cd collabflow

# Install dependencies
cd client && npm install
cd ../server && npm install

# Set up environment variables
cp server/.env.example server/.env
# Fill in Supabase DATABASE_URL, DIRECT_URL, JWT_SECRET, SUPABASE_SERVICE_KEY

# Run Prisma migrations
cd server && npx prisma migrate dev

# Seed the database
npx prisma db seed

# Start dev servers
# Terminal 1 — backend
cd server && npm run dev

# Terminal 2 — frontend
cd client && npm run dev
```

---

## v2 Roadmap

- Email verification & password reset
- Real-time notification system (bell icon / toasts)
- Calendar view (deadlines, milestones)
- AI features: task priority suggestion, comment summary, weekly report generation
- Multi-tenant organization support
