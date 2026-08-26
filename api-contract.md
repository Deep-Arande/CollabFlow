# CollabFlow API Contract

Complete reference for all REST endpoints and Socket.io events.

---

## Table of Contents

1. [Conventions](#conventions)
2. [Authentication](#authentication)
3. [Common Response Format](#common-response-format)
4. [Error Codes](#error-codes)
5. [Access Model](#access-model)
6. [Endpoints](#endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Invites](#invites)
   - [Projects](#projects)
   - [Tasks](#tasks)
   - [Labels](#labels)
   - [Comments](#comments)
   - [Mentions](#mentions)
   - [Attachments](#attachments)
   - [Dashboard](#dashboard)
   - [Activity](#activity)
   - [Reports](#reports)
7. [Socket.io Events](#socketio-events)

---

## Conventions

- **Base URL (dev):** `http://localhost:5000/api`
- **Base URL (prod):** `https://your-railway-app.up.railway.app/api`
- All request bodies are `application/json` unless noted as `multipart/form-data`
- All timestamps are ISO 8601 strings: `"2024-01-15T10:30:00.000Z"`
- UUIDs are used for all `id` fields
- Pagination uses `?page=1&limit=20` query params where supported

---

## Authentication

All protected endpoints require a JWT in the `Authorization` header:

```
Authorization: Bearer <token>
```

- Token is returned on `POST /auth/register` and `POST /auth/login`
- Token payload is just `{ userId }` — there is no account-level role in the token or anywhere else
- Token expiry: **7 days**, stateless (no server-side session/blacklist)
- On expiry the client must re-login — **there is no refresh token endpoint**, despite what older planning docs say

---

## Common Response Format

Every response follows this envelope:

```json
{
  "success": true | false,
  "message": "Human-readable message",
  "data": { ... } | null
}
```

**Success example:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": { "id": "uuid", "name": "Alice" }
  }
}
```

**Error example** (note: error responses have no `data` key at all, not even `null`):
```json
{
  "success": false,
  "message": "Invalid credentials"
}
```

---

## Error Codes

| HTTP Status | Meaning |
|---|---|
| 400 | Bad request — missing or invalid fields |
| 401 | Unauthorized — missing, invalid, or expired token |
| 403 | Forbidden — authenticated but lacks project role or membership |
| 404 | Resource not found |
| 409 | Conflict — e.g. duplicate email, pending invite already exists |
| 500 | Internal server error |

---

## Access Model

**There is no account-level role.** `User` has no `role` column — every user is the same "kind" of account. All access control is **project-scoped**, driven entirely by `ProjectMember`:

```
ProjectMember {
  role:   LEAD | MEMBER        -- this user's role on THIS project
  status: PENDING | ACCEPTED | DECLINED
}
```

- **LEAD** — can edit/archive/delete the project, create/edit/delete tasks, manage members (invite, change role, remove), manage labels
- **MEMBER** — can view the project, update the status of tasks assigned to them, comment, attach files, manage labels
- Only `ACCEPTED` memberships count as active access. `PENDING` = invited but not yet responded; `DECLINED` = user rejected the invite.
- A user can be LEAD on one project and MEMBER on another — role is per-project, not global.
- There is no admin/super-user account and no org-wide view. "Reports" and "Activity" are scoped to **projects the current user leads** (see those sections) — not to all projects in the system.

Shorthand used in this document:
- **[Auth]** — any authenticated user, no project relationship required
- **[Member]** — authenticated + `ACCEPTED` `ProjectMember` on the project in the URL
- **[Lead]** — authenticated + `ACCEPTED` `ProjectMember` with `role: LEAD` on the project in the URL

These are enforced by `requireProjectMember` / `requireProjectLead` middleware (`server/src/middleware/rbac.middleware.ts`), which reads `projectId` from either `:projectId` or `:id` in the route params.

---

## Endpoints

---

### Auth

#### `POST /auth/register`

Create a new user account.

**Auth required:** No

**Request body:**
```json
{
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "password": "securepassword123"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `email` | string | Yes | Must be unique |
| `password` | string | Yes | Hashed with bcrypt (12 rounds) |

There is no `role` field — accounts have no role.

**Response `201`:**
```json
{
  "success": true,
  "message": "Registered successfully",
  "data": {
    "user": {
      "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "avatarUrl": null,
      "createdAt": "2024-01-15T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `400` — name, email, or password missing
- `409` — email already in use

---

#### `POST /auth/login`

Authenticate and receive a JWT.

**Auth required:** No

**Request body:**
```json
{
  "email": "alice@example.com",
  "password": "securepassword123"
}
```

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "avatarUrl": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `400` — email or password missing
- `401` — invalid credentials or deactivated account (`isActive: false`)

---

#### `POST /auth/logout`

Stateless no-op. Client should discard the token — there is nothing to invalidate server-side.

**Auth required:** [Auth]

**Response `200`:**
```json
{ "success": true, "message": "Logged out", "data": null }
```

---

#### `GET /auth/me`

Get the currently authenticated user's profile.

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "id": "d290f1ee-6c54-4b01-90e6-d701748f0851",
      "name": "Alice Johnson",
      "email": "alice@example.com",
      "avatarUrl": null,
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

---

### Users

There is no admin-facing "list all users" endpoint and no user deactivation endpoint. User management beyond self-profile does not exist in the API.

#### `GET /users/search`

Search active users by name or email. Used by the invite-to-project flow.

**Auth required:** [Auth]

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | No | Search term (name or email). Empty/missing `q` returns `{ users: [] }`. |

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "users": [
      { "id": "uuid", "name": "Bob Smith", "email": "bob@example.com", "avatarUrl": null }
    ]
  }
}
```

Returns up to 20 results, only `isActive: true` users, ordered by name.

---

#### `GET /users/:id`

Get a single user's public profile.

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Bob Smith",
      "email": "bob@example.com",
      "avatarUrl": null,
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

**Errors:**
- `404` — user not found

---

#### `PATCH /users/:id`

Update your own name or avatar. **You can only update your own profile** — there is no admin override.

**Auth required:** [Auth]; `:id` must equal the caller's own `userId`

**Request body:**
```json
{
  "name": "Robert Smith",
  "avatarUrl": "https://..."
}
```

All fields optional.

**Response `200`:** Returns the updated `{ id, name, email, avatarUrl }`.

**Errors:**
- `403` — `:id` does not match the authenticated user

---

### Invites

Adding someone to a project does **not** grant instant access — it creates a `PENDING` `ProjectMember` row that the invited user must accept. This is a distinct sub-flow from `POST /projects/:id/members` (see [Projects](#projects)), which is how invites are *sent*.

#### `GET /invites/pending`

List invites awaiting the current user's response.

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "invites": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "role": "MEMBER",
        "status": "PENDING",
        "addedAt": "2024-01-15T10:00:00.000Z",
        "project": { "id": "uuid", "name": "Website Redesign", "description": "..." },
        "inviter": { "id": "uuid", "name": "Alice Johnson", "avatarUrl": null }
      }
    ]
  }
}
```

---

#### `PATCH /invites/:membershipId/respond`

Accept or decline an invite. `:membershipId` is the `ProjectMember.id`.

**Auth required:** [Auth]; only the invited user may respond

**Request body:**
```json
{ "response": "ACCEPTED" }
```

`response` must be `"ACCEPTED"` or `"DECLINED"`.

**Response `200`:** Returns the updated membership row (`status`, `respondedAt` set).

**Errors:**
- `400` — `response` is not `ACCEPTED`/`DECLINED`, or the invite was already answered
- `403` — the invite is not addressed to the caller
- `404` — invite not found

**Side effects:** Writes `ActivityLog` entry with `action: INVITE_ACCEPTED` or `INVITE_DECLINED`

---

### Projects

#### `GET /projects`

List projects where the current user has an `ACCEPTED` membership (any role). There is no org-wide "all projects" view for anyone.

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "projects": [
      {
        "id": "uuid",
        "name": "Website Redesign",
        "description": "Redesign the company homepage",
        "dueDate": "2024-03-01T00:00:00.000Z",
        "status": "ACTIVE",
        "createdBy": "uuid",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-15T10:00:00.000Z",
        "creator": { "id": "uuid", "name": "Alice Johnson" },
        "myRole": "LEAD",
        "_count": { "tasks": 12, "members": 4 }
      }
    ]
  }
}
```

`myRole` is the caller's own project-scoped role (`LEAD` or `MEMBER`) — added so clients can distinguish "projects I lead" from "projects I'm just a member of" without an extra request per project (e.g. used to filter the project picker on the Reports page to only projects the user leads).

---

#### `POST /projects`

Create a new project. **Any authenticated user can create a project** (no gating role). The creator is automatically added as an `ACCEPTED` `ProjectMember` with `role: LEAD`.

**Auth required:** [Auth]

**Request body:**
```json
{
  "name": "Website Redesign",
  "description": "Redesign the company homepage",
  "dueDate": "2024-03-01T00:00:00.000Z"
}
```

| Field | Type | Required |
|---|---|---|
| `name` | string | Yes |
| `dueDate` | ISO date string | Yes |
| `description` | string | No — defaults to `""` |

**Response `201`:** Returns the created project object.

**Errors:**
- `400` — name or dueDate missing

**Side effects:**
- Creates a `ProjectMember` for the creator: `role: LEAD`, `status: ACCEPTED`, `invitedBy: <self>`
- Writes `ActivityLog` entry with `action: PROJECT_CREATED`

---

#### `GET /projects/:id`

Get full project details including members.

**Auth required:** [Member]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "project": {
      "id": "uuid",
      "name": "Website Redesign",
      "description": "...",
      "dueDate": "2024-03-01T00:00:00.000Z",
      "status": "ACTIVE",
      "createdBy": "uuid",
      "creator": { "id": "uuid", "name": "Alice Johnson" },
      "members": [
        {
          "id": "uuid",
          "projectId": "uuid",
          "userId": "uuid",
          "role": "LEAD",
          "status": "ACCEPTED",
          "invitedBy": "uuid",
          "addedAt": "2024-01-15T10:00:00.000Z",
          "respondedAt": "2024-01-15T10:00:00.000Z",
          "user": { "id": "uuid", "name": "Alice Johnson", "email": "alice@example.com", "avatarUrl": null },
          "inviter": { "id": "uuid", "name": "Alice Johnson" }
        }
      ],
      "_count": { "tasks": 12 }
    }
  }
}
```

Note: `members` includes rows in every status (`PENDING`/`ACCEPTED`/`DECLINED`), not just accepted ones — the client is responsible for filtering if it only wants active members.

**Errors:**
- `403` — not an accepted project member
- `404` — project not found

---

#### `PATCH /projects/:id`

Update project name, description, or due date.

**Auth required:** [Lead]

**Request body:**
```json
{
  "name": "Website Redesign v2",
  "description": "Updated scope",
  "dueDate": "2024-04-01T00:00:00.000Z"
}
```

All fields optional.

**Response `200`:** Returns updated project object.

**Side effects:** Writes `ActivityLog` entry with `action: PROJECT_UPDATED`

---

#### `PATCH /projects/:id/archive`

Archive a project. Archived projects remain readable but are excluded from active views by the frontend.

**Auth required:** [Lead]

**Response `200`:** Returns the project with `status: "ARCHIVED"`.

**Side effects:** Writes `ActivityLog` entry with `action: PROJECT_ARCHIVED`

---

#### `DELETE /projects/:id`

Permanently delete a project and all associated data (tasks, comments, attachments, labels, members, activity logs — cascade via FK).

**Auth required:** [Lead]

**Response `200`:**
```json
{ "success": true, "message": "Project deleted", "data": null }
```

---

#### `POST /projects/:id/leave`

Leave a project voluntarily. **The sole remaining LEAD cannot leave** — must promote another member to LEAD first.

**Auth required:** [Member]

**Response `200`:**
```json
{ "success": true, "message": "You have left the project", "data": null }
```

**Errors:**
- `400` — caller is the only `ACCEPTED` LEAD on the project

**Side effects:**
- Deletes the caller's `ProjectMember` row
- Unassigns (`assignedTo: null`) any tasks in the project that were assigned to the caller
- Writes `ActivityLog` entry with `action: MEMBER_LEFT`

---

#### `GET /projects/:id/members`

List all members of a project, in every invite status.

**Auth required:** [Member]

**Response `200`:** Array of `ProjectMember` rows as shown in `GET /projects/:id`, each with `user` and `inviter`.

---

#### `POST /projects/:id/members`

Invite a user to the project. This creates (or resets) a `PENDING` membership — it does **not** grant access immediately. The invited user must accept via `PATCH /invites/:membershipId/respond`.

**Auth required:** [Lead]

**Request body:**
```json
{
  "userId": "uuid-of-user-to-invite",
  "role": "MEMBER"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | Yes | Must be an existing user |
| `role` | enum | No | `LEAD` or `MEMBER` — defaults to `MEMBER` |

**Behavior on repeat invites:**
- Existing `ACCEPTED` membership → `409 "User is already a member"`
- Existing `PENDING` membership → `409 "An invite is already pending for this user"`
- Existing `DECLINED` membership → the same row is reset to `PENDING` with a fresh `invitedBy`/`addedAt`

**Response `201`:**
```json
{
  "success": true,
  "message": "Invite sent",
  "data": {
    "member": {
      "id": "uuid",
      "projectId": "uuid",
      "userId": "uuid",
      "role": "MEMBER",
      "status": "PENDING",
      "addedAt": "2024-01-15T10:00:00.000Z",
      "user": { "id": "uuid", "name": "Bob Smith", "email": "bob@example.com", "avatarUrl": null }
    }
  }
}
```

**Errors:**
- `400` — `userId` missing, or `role` is not `LEAD`/`MEMBER`
- `404` — target user not found
- `409` — see above

**Side effects:** Writes `ActivityLog` entry with `action: MEMBER_INVITED`

---

#### `PATCH /projects/:id/members/:userId`

Change an existing accepted member's project role between `LEAD` and `MEMBER`.

**Auth required:** [Lead]

**Request body:**
```json
{ "role": "LEAD" }
```

**Response `200`:** Returns the updated membership row.

**Errors:**
- `400` — `role` is not `LEAD`/`MEMBER`, or caller tries to change their own role
- `404` — target user has no `ACCEPTED` membership on this project

---

#### `DELETE /projects/:id/members/:userId`

Remove a user from a project (Lead-initiated — for removing yourself, use `POST /projects/:id/leave`).

**Auth required:** [Lead]

**Notes:**
- Cannot remove the project owner (`createdBy`)
- Cannot use this to remove yourself — use "leave" instead

**Response `200`:**
```json
{ "success": true, "message": "Member removed", "data": null }
```

**Errors:**
- `400` — target is the project owner, or target is the caller

**Side effects:**
- Deletes the `ProjectMember` row
- Unassigns (`assignedTo: null`) any tasks in the project assigned to the removed user
- Writes `ActivityLog` entry with `action: MEMBER_REMOVED`

---

### Tasks

All task endpoints are nested under `/projects/:projectId/tasks`. Every route in this router requires `requireProjectMember` at minimum.

#### `GET /projects/:projectId/tasks`

List all tasks in a project with optional filtering.

**Auth required:** [Member]

**Query params:**

| Param | Type | Description |
|---|---|---|
| `status` | enum | Filter by `TODO`, `IN_PROGRESS`, `REVIEW`, `COMPLETED` |
| `priority` | enum | Filter by `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `assignedTo` | string | Filter by assignee userId |
| `search` | string | Search task title (case-insensitive) |

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "tasks": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "title": "Design homepage mockup",
        "description": "Create wireframes for the new homepage",
        "priority": "HIGH",
        "status": "IN_PROGRESS",
        "dueDate": "2024-02-01T00:00:00.000Z",
        "assignedTo": "uuid",
        "createdBy": "uuid",
        "createdAt": "2024-01-15T10:00:00.000Z",
        "updatedAt": "2024-01-16T09:00:00.000Z",
        "assignee": { "id": "uuid", "name": "Bob Smith", "avatarUrl": null },
        "creator": { "id": "uuid", "name": "Alice Johnson" },
        "labels": [
          { "taskId": "uuid", "labelId": "uuid", "label": { "id": "uuid", "projectId": "uuid", "name": "Design", "color": "#8B5CF6" } }
        ],
        "_count": { "comments": 3, "attachments": 1 }
      }
    ]
  }
}
```

`dueDate` may be `null` — it's optional on `Task`, unlike on `Project`.

---

#### `POST /projects/:projectId/tasks`

Create a new task in the project.

**Auth required:** [Lead]

**Request body:**
```json
{
  "title": "Design homepage mockup",
  "description": "Create wireframes for the new homepage",
  "priority": "HIGH",
  "status": "TODO",
  "dueDate": "2024-02-01T00:00:00.000Z",
  "assignedTo": "uuid-of-assignee",
  "labelIds": ["uuid-label-1", "uuid-label-2"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `title` | string | Yes | |
| `description` | string | No | defaults to `""` |
| `priority` | enum | No | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` — defaults to `MEDIUM` |
| `status` | enum | No | `TODO`, `IN_PROGRESS`, `REVIEW`, `COMPLETED` — defaults to `TODO` |
| `dueDate` | ISO date string | No | omit/`null` for no due date |
| `assignedTo` | string (UUID) | No | not validated as a project member server-side |
| `labelIds` | string[] | No | must be existing `Label` UUIDs scoped to this project |

**Response `201`:** Returns the created task with `assignee` and `labels` populated.

**Errors:**
- `400` — title missing

**Side effects:**
- Writes `ActivityLog` entry with `action: TASK_CREATED`
- Emits Socket.io `task:created` to `project:{projectId}` room
- If `assignedTo` is set, also emits `task:assigned`

---

#### `GET /projects/:projectId/tasks/:id`

Get full task details including comments and attachments.

**Auth required:** [Member]

**Response `200`:** Task object with `assignee`, `creator`, `labels`, `comments` (with `author` + `mentions`, oldest-first), and `attachments` (with `uploader`, newest-first).

**Errors:**
- `404` — task not found in this project

---

#### `PATCH /projects/:projectId/tasks/:id`

Update task metadata (title, description, priority, due date, assignee, labels).

**Auth required:** [Lead]

**Request body:**
```json
{
  "title": "Design homepage mockup v2",
  "description": "Updated description",
  "priority": "CRITICAL",
  "dueDate": "2024-02-15T00:00:00.000Z",
  "assignedTo": "uuid-of-new-assignee",
  "labelIds": ["uuid-label-1"]
}
```

All fields optional. If `labelIds` is provided (even `[]`), the existing `TaskLabel` rows are **replaced**, not merged. `status` is **not** updatable via this endpoint — use `PATCH .../status`.

**Side effects:**
- Writes `ActivityLog` entry with `action: TASK_UPDATED`
- If `assignedTo` changed, emits Socket.io `task:assigned`

---

#### `PATCH /projects/:projectId/tasks/:id/status`

Update task status only. This is the board-column-move endpoint.

**Auth required:** [Member]

**Access rules:**
- `MEMBER` (project role) — can only update tasks where `assignedTo === currentUser.id`
- `LEAD` (project role) — can update any task in the project

**Request body:**
```json
{ "status": "IN_PROGRESS" }
```

`status` must be one of: `TODO`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`

**Response `200`:** Returns the updated task.

**Errors:**
- `400` — status missing
- `403` — MEMBER trying to update a task not assigned to them

**Side effects:**
- Writes `ActivityLog` entry with `action: TASK_STATUS_CHANGED`, metadata `{ from, to }`
- Emits Socket.io `task:status_changed` to `project:{projectId}` room

---

#### `DELETE /projects/:projectId/tasks/:id`

Delete a task and all its comments, attachments, labels (cascade).

**Auth required:** [Lead]

**Response `200`:**
```json
{ "success": true, "message": "Task deleted", "data": null }
```

**Side effects:** Writes `ActivityLog` entry with `action: TASK_DELETED`

---

### Labels

**Labels are project-scoped**, not global — each `Label` row belongs to exactly one `Project`. Routes are nested under `/projects/:projectId/labels`.

#### `GET /projects/:projectId/labels`

List all labels for a project.

**Auth required:** [Member]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "labels": [
      { "id": "uuid", "projectId": "uuid", "name": "Design", "color": "#8B5CF6" }
    ]
  }
}
```

---

#### `POST /projects/:projectId/labels`

Create a label on this project. **Any accepted member can manage labels** — this is not Lead-gated.

**Auth required:** [Member]

**Request body:**
```json
{ "name": "Design", "color": "#8B5CF6" }
```

Both fields required.

**Response `201`:** Returns the created label.

**Errors:**
- `400` — name or color missing

---

#### `PATCH /projects/:projectId/labels/:id`

Update a label's name or color.

**Auth required:** [Member]

**Response `200`:** Returns updated label.

**Errors:**
- `404` — label not found on this project

---

#### `DELETE /projects/:projectId/labels/:id`

Delete a label. Removes all `TaskLabel` associations via cascade.

**Auth required:** [Member]

**Response `200`:**
```json
{ "success": true, "message": "Label deleted", "data": null }
```

**Errors:**
- `404` — label not found on this project

---

### Comments

Comment routes are nested under `/tasks/:taskId/comments` (not under `/projects`). They only require [Auth] at the router level — authorization for edit/delete is enforced inside the controller, and read/create do **not** verify project membership server-side.

#### `GET /tasks/:taskId/comments`

List all comments on a task, oldest-first.

**Auth required:** [Auth]

**Response `200`:** Array of comments with `author` and `mentions` (each `{ id, mentionedUser: { id, name } }`).

---

#### `POST /tasks/:taskId/comments`

Add a comment to a task. `@mentions` are parsed server-side and stored as `CommentMention` rows.

**Auth required:** [Auth]

**Request body:**
```json
{ "content": "Looks good! @BobSmith please review the assets." }
```

**@mention parsing:**
- Tokens starting with `@` are matched against the task's project member list by display name (case-insensitive, spaces ignored)
- `@BobSmith` matches a user with name `"Bob Smith"`
- Unmatched `@tokens` are stored as plain text — no error

**Response `201`:** Returns the created comment with `author` and `mentions`.

**Errors:**
- `400` — content is empty/whitespace
- `404` — task not found

**Side effects:**
- Writes `ActivityLog` entry with `action: COMMENT_ADDED`
- Emits Socket.io `comment:new` to `project:{projectId}` room

---

#### `PATCH /tasks/:taskId/comments/:id`

Edit a comment. Re-parses `@mentions` and replaces all `CommentMention` rows.

**Auth required:** **Comment author only** — there is no Lead/moderator override for editing.

**Request body:**
```json
{ "content": "Updated comment text with @AliceJohnson mention." }
```

**Response `200`:** Returns updated comment with re-parsed mentions.

**Errors:**
- `400` — content empty
- `403` — caller is not the comment author
- `404` — comment not found

---

#### `DELETE /tasks/:taskId/comments/:id`

Delete a comment.

**Auth required:** Comment author, **or** a `LEAD` on the comment's project

**Response `200`:**
```json
{ "success": true, "message": "Comment deleted", "data": null }
```

**Errors:**
- `403` — caller is neither the author nor a project LEAD
- `404` — comment not found

---

### Mentions

#### `GET /mentions/me`

Get all comments where the current user has been `@mentioned`. Acts as a notification substitute — sorted newest first, capped at 50.

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "mentions": [
      {
        "id": "uuid",
        "commentId": "uuid",
        "mentionedUserId": "uuid",
        "comment": {
          "id": "uuid",
          "content": "Hey @BobSmith can you check this?",
          "createdAt": "2024-01-16T09:00:00.000Z",
          "author": { "id": "uuid", "name": "Alice Johnson", "avatarUrl": null },
          "task": { "id": "uuid", "title": "Design homepage mockup", "projectId": "uuid" }
        }
      }
    ]
  }
}
```

---

### Attachments

Attachment routes are nested under `/tasks/:taskId/attachments`.

#### `POST /tasks/:taskId/attachments`

Upload a file to a task. File is stored in Supabase Storage (private bucket). A storage path is saved — never a public URL.

**Auth required:** [Auth] + must be an `ACCEPTED` member of the task's project (checked in the controller, not route middleware)

**Content-Type:** `multipart/form-data`

**Form field:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | File | Yes | Max 10 MB. Allowed MIME types: `image/jpeg`, `image/png`, `image/gif`, `image/webp`, `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`) |

**Storage path format:**
```
project-{projectId}/task-{taskId}/{uuid}.{ext}
```

**Response `201`:** Returns the attachment with `uploader`.

**Errors:**
- `400` — no file provided, or file rejected by `fileFilter` (unsupported MIME type)
- `403` — not an accepted member of the project
- `404` — task not found

**Side effects:** Writes `ActivityLog` entry with `action: ATTACHMENT_UPLOADED`

---

#### `GET /tasks/:taskId/attachments`

List all attachments on a task (metadata only, no URLs).

**Auth required:** [Auth] + must be an accepted project member

---

#### `GET /tasks/:taskId/attachments/:id/url`

Generate a short-lived signed URL to access/download the file directly from Supabase Storage.

**Auth required:** [Auth] + must be an accepted project member

**Notes:**
- The permission check happens on the Express backend — Supabase never issues the signed URL without Express authorizing the request first
- Signed URL expires in **120 seconds**

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "signedUrl": "https://[ref].supabase.co/storage/v1/object/sign/attachments/...",
    "expiresIn": 120
  }
}
```

**Errors:**
- `403` — not an accepted member of the project
- `404` — attachment not found

---

#### `DELETE /tasks/:taskId/attachments/:id`

Delete an attachment from both Supabase Storage and the database.

**Auth required:** Uploader, **or** a `LEAD` on the attachment's project

**Response `200`:**
```json
{ "success": true, "message": "Attachment deleted", "data": null }
```

---

### Dashboard

#### `GET /dashboard`

Returns statistics scoped to projects the current user is an `ACCEPTED` member of (any role), plus tasks assigned to them personally. `GET /dashboard/stats` is an alias for the same handler.

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "totalProjects": 4,
    "activeTasks": 8,
    "completedTasks": 24,
    "overdueTasksCount": 2,
    "myTasks": [
      {
        "id": "uuid",
        "title": "Submit final report",
        "status": "IN_PROGRESS",
        "priority": "HIGH",
        "dueDate": "2024-02-01T00:00:00.000Z",
        "projectId": "uuid",
        "assignedTo": "uuid",
        "createdBy": "uuid",
        "createdAt": "2024-01-10T00:00:00.000Z",
        "assignee": { "id": "uuid", "name": "Bob Smith", "avatarUrl": null }
      }
    ],
    "recentActivity": [
      {
        "id": "uuid",
        "action": "TASK_STATUS_CHANGED",
        "targetType": "Task",
        "targetId": "uuid",
        "metadata": { "from": "TODO", "to": "IN_PROGRESS" },
        "createdAt": "2024-01-16T09:00:00.000Z",
        "user": { "id": "uuid", "name": "Bob Smith", "avatarUrl": null }
      }
    ]
  }
}
```

Notes on scope:
- `totalProjects` / `activeTasks` / `completedTasks` / `overdueTasksCount` / `recentActivity` are scoped to **all projects the user belongs to** (any role, accepted only)
- `myTasks` is scoped to **tasks assigned to the user personally** (not filtered by project membership, but assignment already implies it), incomplete only, top 10 by soonest due date
- There is no `taskStats` breakdown by status, no separate `upcomingDeadlines`/`projectProgress` blocks, and no per-role scope difference — this shape is the same for every user, since there's no account role to branch on

---

### Activity

#### `GET /activity`

Activity feed scoped to **projects the current user LEADs** (`ProjectMember.role === 'LEAD'`, `status === 'ACCEPTED'`) — not just projects they're a member of, and not just their own actions.

**Auth required:** [Auth]

**Query params:** `page` (default `1`), `limit` (default `30`)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "logs": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "action": "TASK_STATUS_CHANGED",
        "targetType": "Task",
        "targetId": "uuid",
        "metadata": { "from": "TODO", "to": "IN_PROGRESS" },
        "createdAt": "2024-01-16T09:00:00.000Z",
        "user": { "id": "uuid", "name": "Bob Smith", "avatarUrl": null }
      }
    ],
    "total": 128,
    "page": 1,
    "limit": 30
  }
}
```

**Known action types:**

| Action | Trigger |
|---|---|
| `PROJECT_CREATED` | Project created |
| `PROJECT_UPDATED` | Project name/description/date changed |
| `PROJECT_ARCHIVED` | Project archived |
| `MEMBER_INVITED` | User invited to project |
| `INVITE_ACCEPTED` | Invited user accepted |
| `INVITE_DECLINED` | Invited user declined |
| `MEMBER_REMOVED` | User removed from project by a Lead |
| `MEMBER_LEFT` | User left a project voluntarily |
| `TASK_CREATED` | Task created |
| `TASK_UPDATED` | Task metadata changed |
| `TASK_STATUS_CHANGED` | Task moved to a new status |
| `TASK_DELETED` | Task deleted |
| `COMMENT_ADDED` | Comment posted on task |
| `ATTACHMENT_UPLOADED` | File attached to task |

---

#### `GET /activity/audit`

**Currently scoped identically to `GET /activity`** (projects the user leads) — it is not an unfiltered, org-wide audit log, since there is no admin/global scope in this system. Kept as a separate endpoint for a future distinction; today it returns the same data shape and same query params (`page`, default `limit` `50`).

**Auth required:** [Auth]

---

#### `GET /activity/project/:projectId`

Activity feed scoped to one project, unfiltered by action or user.

**Auth required:** [Member]

**Query params:** `page`, `limit`

**Response `200`:** Same shape as `GET /activity`.

---

### Reports

All report endpoints require only [Auth] at the route level — there is no role gate at the router. Scope is computed inside each controller as **"projects the current user LEADs"** (same `getScopedProjectIds` helper). Passing `?projectId=` narrows to that project, but the controller **does validate** it's in the caller's led-project list first — `403 "You do not have report access to this project"` otherwise. (This check was added after an initial version trusted `projectId` blindly, which let any authenticated user pull report data for a project they weren't even a member of — an IDOR. If you're auditing this code, confirm all three endpoints below still have the check; it's easy to lose on a future edit since it's not enforced by middleware.)

#### `GET /reports/overview`

Task completion summary, delayed tasks, daily completion trend over the last 7 days.

**Auth required:** [Auth]

**Query params:** `projectId` (optional — narrows scope)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "total": 40,
    "completed": 24,
    "delayed": 3,
    "completionRate": 60,
    "byPriority": { "LOW": 5, "MEDIUM": 18, "HIGH": 12, "CRITICAL": 5 },
    "dailyCompleted": {
      "2024-01-10": 2,
      "2024-01-11": 4,
      "2024-01-12": 1,
      "2024-01-13": 5,
      "2024-01-14": 3,
      "2024-01-15": 6,
      "2024-01-16": 3
    }
  }
}
```

`dailyCompleted` is keyed by `updatedAt` date of tasks completed in the last 7 days (not a true "completed on this day" audit trail — a task re-marked `COMPLETED` bumps `updatedAt`).

---

#### `GET /reports/team-performance`

Per-assignee task statistics for chart rendering.

**Auth required:** [Auth]

**Query params:** `projectId` (optional)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "performance": [
      { "id": "uuid", "name": "Bob Smith", "avatarUrl": null, "total": 10, "completed": 7, "inProgress": 2, "completionRate": 70 }
    ]
  }
}
```

---

#### `GET /reports/export`

Returns full report data as JSON for client-side PDF generation.

**Auth required:** [Auth]

**Query params:** `projectId` (optional)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "tasks": [ "...full task objects with assignee and project..." ],
    "projects": [ "...project objects with task/member counts..." ],
    "generatedAt": "2024-01-16T10:00:00.000Z"
  }
}
```

**Frontend status:** `client/src/pages/ReportsPage.tsx` (route `/reports`) consumes all three report endpoints — stat cards + priority breakdown from `overview`, a table from `team-performance`, and a "Export JSON" button that downloads the `export` payload as a file. There's still no PDF generation (`client/package.json` has no PDF/chart library) — export is raw JSON, not a formatted PDF. The page's project picker only lists projects where `myRole === 'LEAD'` (see `GET /projects`), matching the endpoints' actual authorization.

---

## Socket.io Events

### Connection

Connect with JWT in the auth handshake:

```js
const socket = io('http://localhost:5000', {
  auth: { token: 'your-jwt-token' }
});
```

If the token is missing or invalid, the connection is rejected with an `Unauthorized`/`Invalid or expired token` error — same JWT used for REST, verified the same way (`verifyToken`), but **not** re-checked against project membership at the socket layer.

### Rooms

Clients join project rooms to receive project-scoped events. Membership is **not verified server-side** on join — any authenticated socket can join any `project:{id}` room by guessing/knowing the id.

```js
// Join — call when user opens a project
socket.emit('join:project', projectId);

// Leave — call when user navigates away
socket.emit('leave:project', projectId);
```

### Server → Client Events

All events are emitted to `project:{projectId}` rooms only — sockets not in the room never receive the event.

---

#### `task:created`

Fired when a new task is created in the project.

```js
socket.on('task:created', ({ task }) => {
  // task: full task object with assignee and labels
});
```

---

#### `task:assigned`

Fired when a task is assigned or reassigned to a user (on create with `assignedTo` set, or on update when `assignedTo` changes).

```js
socket.on('task:assigned', ({ taskId, assignedTo }) => {
  // taskId: string
  // assignedTo: userId string
});
```

---

#### `task:status_changed`

Fired when a task's status changes.

```js
socket.on('task:status_changed', ({ taskId, status, projectId }) => {
  // status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED'
});
```

---

#### `comment:new`

Fired when a comment is posted on any task in the project.

```js
socket.on('comment:new', ({ comment, taskId }) => {
  // comment: full comment object with author and mentions
});
```

---

**Not implemented:** there is no socket event for invites (`MEMBER_INVITED`/`INVITE_ACCEPTED`) — those are activity-log-only, no real-time push.

---

*Last verified against the server implementation (post `architectural-change` merge) — schema has no `User.role`; access control is entirely project-scoped via `ProjectMember.role`/`status`. Append new decisions below this line.*
