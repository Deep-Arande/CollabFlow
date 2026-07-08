# CollabFlow API Contract

Complete reference for all REST endpoints and Socket.io events.

---

## Table of Contents

1. [Conventions](#conventions)
2. [Authentication](#authentication)
3. [Common Response Format](#common-response-format)
4. [Error Codes](#error-codes)
5. [Roles & Access Levels](#roles--access-levels)
6. [Endpoints](#endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Projects](#projects)
   - [Tasks](#tasks)
   - [Comments](#comments)
   - [Mentions](#mentions)
   - [Attachments](#attachments)
   - [Labels](#labels)
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
- Token expiry: **7 days**
- On expiry the client must re-login (no refresh token flow)

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

**Error example:**
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
| 403 | Forbidden — authenticated but lacks role or project membership |
| 404 | Resource not found |
| 409 | Conflict — e.g. duplicate email or existing project member |
| 500 | Internal server error |

---

## Roles & Access Levels

| Role | Label | Scope |
|---|---|---|
| `ADMIN` | Admin | Org-wide — all projects, all users, all analytics |
| `TEAM_LEAD` | Team Lead | Project-scoped — only projects they created or are a member of |
| `TEAM_MEMBER` | Member | Task-scoped — only tasks assigned to them within their projects |

Shorthand used in this document:
- **[Auth]** — any authenticated user (any role)
- **[Lead+]** — `TEAM_LEAD` or `ADMIN`
- **[Admin]** — `ADMIN` only

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
  "password": "securepassword123",
  "role": "TEAM_MEMBER"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | Yes | |
| `email` | string | Yes | Must be unique |
| `password` | string | Yes | Hashed with bcrypt (12 rounds) |
| `role` | enum | No | `ADMIN`, `TEAM_LEAD`, `TEAM_MEMBER` — defaults to `TEAM_MEMBER` |

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
      "role": "TEAM_MEMBER",
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
      "role": "TEAM_MEMBER",
      "avatarUrl": null
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Errors:**
- `400` — email or password missing
- `401` — invalid credentials or deactivated account

---

#### `POST /auth/logout`

Invalidate the current session. Client should discard the token.

**Auth required:** [Auth]

**Request body:** None

**Response `200`:**
```json
{
  "success": true,
  "message": "Logged out",
  "data": null
}
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
      "role": "TEAM_MEMBER",
      "avatarUrl": null,
      "createdAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

---

### Users

#### `GET /users`

List all users with optional search and pagination.

**Auth required:** [Admin]

**Query params:**

| Param | Type | Default | Description |
|---|---|---|---|
| `page` | number | `1` | Page number |
| `limit` | number | `20` | Results per page |
| `search` | string | — | Filter by name or email (case-insensitive) |

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "users": [
      {
        "id": "uuid",
        "name": "Alice Johnson",
        "email": "alice@example.com",
        "role": "TEAM_MEMBER",
        "isActive": true,
        "createdAt": "2024-01-15T10:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

---

#### `GET /users/search`

Search users by name or email. Used when adding members to a project.

**Auth required:** [Lead+]

**Query params:**

| Param | Type | Required | Description |
|---|---|---|---|
| `q` | string | Yes | Search term (name or email) |

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "users": [
      {
        "id": "uuid",
        "name": "Bob Smith",
        "email": "bob@example.com",
        "role": "TEAM_MEMBER",
        "avatarUrl": null
      }
    ]
  }
}
```

Returns up to 10 results. Only returns `isActive: true` users.

---

#### `GET /users/:id`

Get a single user's details.

**Auth required:** [Admin]

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
      "role": "TEAM_MEMBER",
      "isActive": true,
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

Update a user's name or role.

**Auth required:** [Admin]

**Request body:**
```json
{
  "name": "Robert Smith",
  "role": "TEAM_LEAD"
}
```

All fields optional — only provided fields are updated.

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Robert Smith",
      "email": "bob@example.com",
      "role": "TEAM_LEAD",
      "isActive": true
    }
  }
}
```

---

#### `PATCH /users/:id/deactivate`

Deactivate a user account. Deactivated users cannot log in.

**Auth required:** [Admin]

**Request body:** None

**Response `200`:**
```json
{
  "success": true,
  "message": "User deactivated",
  "data": {
    "user": {
      "id": "uuid",
      "name": "Bob Smith",
      "email": "bob@example.com",
      "isActive": false
    }
  }
}
```

---

### Projects

#### `GET /projects`

List all projects scoped to the current user's role.

**Auth required:** [Auth]

**Scope behavior:**
- `ADMIN` — returns all projects
- `TEAM_LEAD` / `TEAM_MEMBER` — returns only projects where they are in `ProjectMembers`

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
        "_count": { "tasks": 12, "members": 4 }
      }
    ]
  }
}
```

---

#### `POST /projects`

Create a new project. The creator is automatically added as a project member with role `LEAD`.

**Auth required:** [Lead+]

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
| `description` | string | No |

**Response `201`:**
```json
{
  "success": true,
  "message": "Project created",
  "data": {
    "project": {
      "id": "uuid",
      "name": "Website Redesign",
      "description": "Redesign the company homepage",
      "dueDate": "2024-03-01T00:00:00.000Z",
      "status": "ACTIVE",
      "createdBy": "uuid",
      "createdAt": "2024-01-15T10:00:00.000Z",
      "updatedAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

**Side effects:**
- Creates a `ProjectMember` entry for the creator with `role: LEAD`
- Writes an `ActivityLog` entry with `action: PROJECT_CREATED`

---

#### `GET /projects/:id`

Get full project details including members.

**Auth required:** [Auth] + must be a project member (or Admin)

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
          "addedAt": "2024-01-15T10:00:00.000Z",
          "user": {
            "id": "uuid",
            "name": "Alice Johnson",
            "email": "alice@example.com",
            "avatarUrl": null,
            "role": "TEAM_LEAD"
          }
        }
      ],
      "_count": { "tasks": 12 }
    }
  }
}
```

**Errors:**
- `403` — not a project member
- `404` — project not found

---

#### `PATCH /projects/:id`

Update project name, description, or due date.

**Auth required:** Project owner or Admin

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

Archive a project. Archived projects remain readable but are excluded from active views.

**Auth required:** Project owner or Admin

**Request body:** None

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "project": { "id": "uuid", "status": "ARCHIVED", "..." : "..." }
  }
}
```

**Side effects:** Writes `ActivityLog` entry with `action: PROJECT_ARCHIVED`

---

#### `DELETE /projects/:id`

Permanently delete a project and all associated data (tasks, comments, attachments, members, activity logs — cascade).

**Auth required:** Project owner or Admin

**Response `200`:**
```json
{
  "success": true,
  "message": "Project deleted",
  "data": null
}
```

---

#### `GET /projects/:id/members`

List all members of a project.

**Auth required:** [Auth] + must be a project member (or Admin)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "members": [
      {
        "id": "uuid",
        "projectId": "uuid",
        "userId": "uuid",
        "role": "LEAD",
        "addedAt": "2024-01-15T10:00:00.000Z",
        "user": {
          "id": "uuid",
          "name": "Alice Johnson",
          "email": "alice@example.com",
          "avatarUrl": null,
          "role": "TEAM_LEAD"
        }
      }
    ]
  }
}
```

---

#### `POST /projects/:id/members`

Add an existing user to a project.

**Auth required:** Project owner or Admin

**Request body:**
```json
{
  "userId": "uuid-of-user-to-add",
  "role": "MEMBER"
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `userId` | string | Yes | Must be an existing active user |
| `role` | enum | No | `LEAD` or `MEMBER` — defaults to `MEMBER` |

**Response `201`:**
```json
{
  "success": true,
  "message": "Member added",
  "data": {
    "member": {
      "id": "uuid",
      "projectId": "uuid",
      "userId": "uuid",
      "role": "MEMBER",
      "addedAt": "2024-01-15T10:00:00.000Z"
    }
  }
}
```

**Errors:**
- `404` — project not found
- `409` — user is already a member

**Side effects:** Writes `ActivityLog` entry with `action: MEMBER_ADDED`

---

#### `DELETE /projects/:id/members/:userId`

Remove a user from a project.

**Auth required:** Project owner or Admin

**Notes:**
- Cannot remove the project owner (`createdBy`)

**Response `200`:**
```json
{
  "success": true,
  "message": "Member removed",
  "data": null
}
```

**Errors:**
- `400` — attempting to remove the project owner

**Side effects:** Writes `ActivityLog` entry with `action: MEMBER_REMOVED`

---

### Tasks

All task endpoints are nested under `/projects/:projectId/tasks`. The `projectId` in the path enforces that requests are always scoped to a project.

#### `GET /projects/:projectId/tasks`

List all tasks in a project with optional filtering.

**Auth required:** [Auth] + must be a project member (or Admin)

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
          { "taskId": "uuid", "labelId": "uuid", "label": { "id": "uuid", "name": "Design", "color": "#8B5CF6" } }
        ],
        "_count": { "comments": 3, "attachments": 1 }
      }
    ]
  }
}
```

---

#### `POST /projects/:projectId/tasks`

Create a new task in the project.

**Auth required:** [Lead+] + must be a project member (or Admin)

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
| `description` | string | No | |
| `priority` | enum | No | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` — defaults to `MEDIUM` |
| `status` | enum | No | `TODO`, `IN_PROGRESS`, `REVIEW`, `COMPLETED` — defaults to `TODO` |
| `dueDate` | ISO date string | No | |
| `assignedTo` | string (UUID) | No | Must be a project member |
| `labelIds` | string[] | No | Array of existing Label UUIDs |

**Response `201`:**
```json
{
  "success": true,
  "message": "Task created",
  "data": {
    "task": {
      "id": "uuid",
      "projectId": "uuid",
      "title": "Design homepage mockup",
      "priority": "HIGH",
      "status": "TODO",
      "assignee": { "id": "uuid", "name": "Bob Smith", "avatarUrl": null },
      "labels": [ ... ],
      "..."
    }
  }
}
```

**Side effects:**
- Writes `ActivityLog` entry with `action: TASK_CREATED`
- Emits Socket.io `task:created` to `project:{projectId}` room
- If `assignedTo` is set, also emits `task:assigned`

---

#### `GET /projects/:projectId/tasks/:id`

Get full task details including comments, attachments, and labels.

**Auth required:** [Auth] + must be a project member (or Admin)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "task": {
      "id": "uuid",
      "title": "Design homepage mockup",
      "description": "...",
      "priority": "HIGH",
      "status": "IN_PROGRESS",
      "dueDate": "2024-02-01T00:00:00.000Z",
      "assignee": { "id": "uuid", "name": "Bob Smith", "avatarUrl": null },
      "creator": { "id": "uuid", "name": "Alice Johnson" },
      "labels": [ { "label": { "id": "uuid", "name": "Design", "color": "#8B5CF6" } } ],
      "comments": [
        {
          "id": "uuid",
          "content": "Mockup looks good! @BobSmith can you review?",
          "createdAt": "2024-01-16T09:00:00.000Z",
          "updatedAt": "2024-01-16T09:00:00.000Z",
          "author": { "id": "uuid", "name": "Alice Johnson", "avatarUrl": null },
          "mentions": [
            { "id": "uuid", "mentionedUser": { "id": "uuid", "name": "Bob Smith" } }
          ]
        }
      ],
      "attachments": [
        {
          "id": "uuid",
          "fileName": "mockup-v1.pdf",
          "fileType": "PDF",
          "createdAt": "2024-01-16T10:00:00.000Z",
          "uploader": { "id": "uuid", "name": "Alice Johnson" }
        }
      ]
    }
  }
}
```

---

#### `PATCH /projects/:projectId/tasks/:id`

Update task metadata (title, description, priority, due date, assignee, labels).

**Auth required:** [Lead+] + must be a project member (or Admin)

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

All fields optional. If `labelIds` is provided, the existing labels are **replaced** (not merged).

**Side effects:**
- Writes `ActivityLog` entry with `action: TASK_UPDATED`
- If `assignedTo` changed, emits Socket.io `task:assigned`

---

#### `PATCH /projects/:projectId/tasks/:id/status`

Update task status only. This is the Kanban drag-and-drop endpoint.

**Auth required:** [Auth] + must be a project member (or Admin)

**Access rules:**
- `TEAM_MEMBER` — can only update tasks where `assignedTo === currentUser.id`
- `TEAM_LEAD` / `ADMIN` — can update any task in the project

**Request body:**
```json
{
  "status": "IN_PROGRESS"
}
```

`status` must be one of: `TODO`, `IN_PROGRESS`, `REVIEW`, `COMPLETED`

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "task": {
      "id": "uuid",
      "status": "IN_PROGRESS",
      "..."
    }
  }
}
```

**Errors:**
- `400` — status missing
- `403` — TEAM_MEMBER trying to update a task not assigned to them

**Side effects:**
- Writes `ActivityLog` entry with `action: TASK_STATUS_CHANGED`, metadata includes `{ from: "TODO", to: "IN_PROGRESS" }`
- Emits Socket.io `task:status_changed` to `project:{projectId}` room

---

#### `DELETE /projects/:projectId/tasks/:id`

Delete a task and all its comments, attachments, labels.

**Auth required:** [Lead+] + must be a project member (or Admin)

**Response `200`:**
```json
{
  "success": true,
  "message": "Task deleted",
  "data": null
}
```

**Side effects:** Writes `ActivityLog` entry with `action: TASK_DELETED`

---

### Comments

#### `GET /tasks/:taskId/comments`

List all comments on a task ordered oldest-first.

**Auth required:** [Auth] + must be a project member (or Admin)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "comments": [
      {
        "id": "uuid",
        "taskId": "uuid",
        "content": "Looks good! @BobSmith please review the assets.",
        "createdAt": "2024-01-16T09:00:00.000Z",
        "updatedAt": "2024-01-16T09:00:00.000Z",
        "author": { "id": "uuid", "name": "Alice Johnson", "avatarUrl": null },
        "mentions": [
          { "id": "uuid", "mentionedUser": { "id": "uuid", "name": "Bob Smith" } }
        ]
      }
    ]
  }
}
```

---

#### `POST /tasks/:taskId/comments`

Add a comment to a task. @mentions are parsed server-side and stored as `CommentMention` rows.

**Auth required:** [Auth] + must be a project member (or Admin)

**Request body:**
```json
{
  "content": "Looks good! @BobSmith please review the assets."
}
```

**@mention parsing:**
- Tokens starting with `@` are matched against the project's member list by display name
- `@BobSmith` matches a user with name `"Bob Smith"` (case-insensitive, spaces ignored)
- Unmatched @tokens are stored as plain text — no error is thrown

**Response `201`:**
```json
{
  "success": true,
  "message": "Comment added",
  "data": {
    "comment": {
      "id": "uuid",
      "taskId": "uuid",
      "content": "Looks good! @BobSmith please review the assets.",
      "createdAt": "2024-01-16T09:00:00.000Z",
      "updatedAt": "2024-01-16T09:00:00.000Z",
      "author": { "id": "uuid", "name": "Alice Johnson", "avatarUrl": null },
      "mentions": [
        { "id": "uuid", "mentionedUser": { "id": "uuid", "name": "Bob Smith" } }
      ]
    }
  }
}
```

**Errors:**
- `400` — content is empty
- `404` — task not found

**Side effects:**
- Writes `ActivityLog` entry with `action: COMMENT_ADDED`
- Emits Socket.io `comment:new` to `project:{projectId}` room

---

#### `PATCH /tasks/:taskId/comments/:id`

Edit a comment. Re-parses @mentions and replaces all `CommentMention` rows.

**Auth required:** Comment author (any role) or Lead+ for moderation

**Access rules:**
- `TEAM_MEMBER` — can only edit their own comments
- `TEAM_LEAD` / `ADMIN` — can edit any comment

**Request body:**
```json
{
  "content": "Updated comment text with @AliceJohnson mention."
}
```

**Response `200`:** Returns updated comment with re-parsed mentions.

---

#### `DELETE /tasks/:taskId/comments/:id`

Delete a comment.

**Auth required:** Comment author, `TEAM_LEAD`, or `ADMIN`

**Response `200`:**
```json
{
  "success": true,
  "message": "Comment deleted",
  "data": null
}
```

---

### Mentions

#### `GET /mentions/me`

Get all comments where the current user has been @mentioned. Acts as a notification substitute — sorted newest first, capped at 50.

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
          "task": {
            "id": "uuid",
            "title": "Design homepage mockup",
            "projectId": "uuid"
          }
        }
      }
    ]
  }
}
```

---

### Attachments

#### `POST /tasks/:taskId/attachments`

Upload a file to a task. File is stored in Supabase Storage (private bucket). A storage path is saved — never a public URL.

**Auth required:** [Auth] + must be a project member (or Admin)

**Content-Type:** `multipart/form-data`

**Form field:**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | File | Yes | Max 10 MB. Allowed: JPEG, PNG, GIF, WEBP, PDF, DOCX |

**Storage path format:**
```
project-{projectId}/task-{taskId}/{uuid}.{ext}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "File uploaded",
  "data": {
    "attachment": {
      "id": "uuid",
      "taskId": "uuid",
      "fileName": "mockup-v1.pdf",
      "fileType": "PDF",
      "filePath": "project-uuid/task-uuid/abc123.pdf",
      "createdAt": "2024-01-16T10:00:00.000Z",
      "uploader": { "id": "uuid", "name": "Alice Johnson" }
    }
  }
}
```

**Errors:**
- `400` — no file provided
- `403` — not a project member
- `404` — task not found

**Side effects:** Writes `ActivityLog` entry with `action: ATTACHMENT_UPLOADED`

---

#### `GET /tasks/:taskId/attachments`

List all attachments on a task (metadata only, no URLs).

**Auth required:** [Auth] + must be a project member (or Admin)

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "attachments": [
      {
        "id": "uuid",
        "taskId": "uuid",
        "fileName": "mockup-v1.pdf",
        "fileType": "PDF",
        "filePath": "project-uuid/task-uuid/abc123.pdf",
        "createdAt": "2024-01-16T10:00:00.000Z",
        "uploader": { "id": "uuid", "name": "Alice Johnson" }
      }
    ]
  }
}
```

---

#### `GET /tasks/:taskId/attachments/:id/url`

Generate a short-lived signed URL to access or download the file directly from Supabase Storage.

**Auth required:** [Auth] + must be a project member (or Admin)

**Notes:**
- The permission check is performed by the backend — Supabase never issues the signed URL without Express authorizing the request first
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
- `403` — not a project member
- `404` — attachment not found

---

#### `DELETE /tasks/:taskId/attachments/:id`

Delete an attachment from both Supabase Storage and the database.

**Auth required:** Uploader, `TEAM_LEAD`, or `ADMIN`

**Access rules:**
- `TEAM_MEMBER` — can only delete attachments they uploaded
- `TEAM_LEAD` / `ADMIN` — can delete any attachment

**Response `200`:**
```json
{
  "success": true,
  "message": "Attachment deleted",
  "data": null
}
```

---

### Labels

#### `GET /labels`

List all labels (global, not project-scoped).

**Auth required:** [Auth]

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "labels": [
      { "id": "uuid", "name": "Design", "color": "#8B5CF6" },
      { "id": "uuid", "name": "Bug", "color": "#EF4444" },
      { "id": "uuid", "name": "Feature", "color": "#10B981" }
    ]
  }
}
```

---

#### `POST /labels`

Create a new label.

**Auth required:** [Lead+]

**Request body:**
```json
{
  "name": "Design",
  "color": "#8B5CF6"
}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "Label created",
  "data": {
    "label": { "id": "uuid", "name": "Design", "color": "#8B5CF6" }
  }
}
```

---

#### `PATCH /labels/:id`

Update a label's name or color. Updates apply everywhere the label is used.

**Auth required:** [Lead+]

**Request body:**
```json
{
  "name": "UI Design",
  "color": "#7C3AED"
}
```

**Response `200`:** Returns updated label.

---

#### `DELETE /labels/:id`

Delete a label. Removes all `TaskLabel` associations via cascade.

**Auth required:** [Admin]

**Response `200`:**
```json
{
  "success": true,
  "message": "Label deleted",
  "data": null
}
```

---

### Dashboard

#### `GET /dashboard`

Returns role-scoped statistics for the current user.

**Auth required:** [Auth]

**Scope behavior:**
- `ADMIN` — org-wide data across all projects
- `TEAM_LEAD` — data scoped to projects they lead
- `TEAM_MEMBER` — data scoped to tasks assigned to them

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "taskStats": {
      "todo": 5,
      "inProgress": 8,
      "review": 3,
      "completed": 24
    },
    "upcomingDeadlines": [
      {
        "id": "uuid",
        "title": "Submit final report",
        "dueDate": "2024-02-01T00:00:00.000Z",
        "priority": "HIGH",
        "projectId": "uuid",
        "assignee": { "id": "uuid", "name": "Bob Smith" }
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
    ],
    "projectProgress": [
      {
        "id": "uuid",
        "name": "Website Redesign",
        "totalTasks": 12,
        "completedTasks": 7,
        "progress": 58
      }
    ]
  }
}
```

---

### Activity

#### `GET /activity`

Get activity feed scoped to the current user's role.

**Auth required:** [Auth]

**Scope behavior:**
- `ADMIN` — all activity
- `TEAM_LEAD` — activity in their projects
- `TEAM_MEMBER` — only their own actions

**Query params:** `page`, `limit` (default `30`)

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
| `MEMBER_ADDED` | User added to project |
| `MEMBER_REMOVED` | User removed from project |
| `TASK_CREATED` | Task created |
| `TASK_UPDATED` | Task metadata changed |
| `TASK_STATUS_CHANGED` | Task moved on Kanban |
| `TASK_DELETED` | Task deleted |
| `COMMENT_ADDED` | Comment posted on task |
| `ATTACHMENT_UPLOADED` | File attached to task |

---

#### `GET /activity/audit`

Full unfiltered `ActivityLog` — all events across the entire org.

**Auth required:** [Admin]

**Query params:** `page`, `limit` (default `50`)

**Response `200`:** Same shape as `GET /activity`.

---

#### `GET /activity/project/:projectId`

Activity feed scoped to one project.

**Auth required:** [Auth] + must be a project member (or Admin)

**Query params:** `page`, `limit`

**Response `200`:** Same shape as `GET /activity`.

---

### Reports

All report endpoints are restricted to `TEAM_LEAD` and `ADMIN`. Team Leads see data scoped to their own projects; Admins see org-wide data. Pass `?projectId=` to further narrow scope.

#### `GET /reports/overview`

Task completion summary, delayed tasks, daily completion trend over the last 7 days.

**Auth required:** [Lead+]

**Query params:**

| Param | Type | Description |
|---|---|---|
| `projectId` | string | Narrow to a single project |

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
    "byPriority": {
      "LOW": 5,
      "MEDIUM": 18,
      "HIGH": 12,
      "CRITICAL": 5
    },
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

---

#### `GET /reports/team-performance`

Per-member task statistics for chart rendering.

**Auth required:** [Lead+]

**Query params:**

| Param | Type | Description |
|---|---|---|
| `projectId` | string | Narrow to a single project |

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "performance": [
      {
        "id": "uuid",
        "name": "Bob Smith",
        "avatarUrl": null,
        "total": 10,
        "completed": 7,
        "inProgress": 2,
        "completionRate": 70
      }
    ]
  }
}
```

---

#### `GET /reports/export`

Returns full report data as JSON. The frontend uses this payload to generate a PDF via a client-side library (e.g. jsPDF).

**Auth required:** [Lead+]

**Query params:**

| Param | Type | Description |
|---|---|---|
| `projectId` | string | Narrow to a single project |

**Response `200`:**
```json
{
  "success": true,
  "message": "Success",
  "data": {
    "tasks": [ { "...full task objects with assignee and project..." } ],
    "projects": [ { "...project objects with task/member counts..." } ],
    "generatedAt": "2024-01-16T10:00:00.000Z"
  }
}
```

---

## Socket.io Events

### Connection

Connect with JWT in the auth handshake:

```js
const socket = io('http://localhost:5000', {
  auth: { token: 'your-jwt-token' }
});
```

If the token is missing or invalid, the connection is rejected with an `Unauthorized` error.

### Rooms

Clients join project rooms to receive project-scoped events:

```js
// Join — call when user opens a project
socket.emit('join:project', projectId);

// Leave — call when user navigates away
socket.emit('leave:project', projectId);
```

### Server → Client Events

All events are emitted to `project:{projectId}` rooms only — users not in the room never receive the event.

---

#### `task:created`

Fired when a new task is created in the project.

```js
socket.on('task:created', ({ task }) => {
  // task: full task object with assignee and labels
});
```

**When to use:** Add the new task card to the Kanban board in real time.

---

#### `task:assigned`

Fired when a task is assigned or reassigned to a user.

```js
socket.on('task:assigned', ({ taskId, assignedTo }) => {
  // taskId: string
  // assignedTo: userId string
});
```

**When to use:** Update the assignee chip on the task card; highlight in the assignee's dashboard.

---

#### `task:status_changed`

Fired when a task's status changes (Kanban drag-and-drop).

```js
socket.on('task:status_changed', ({ taskId, status, projectId }) => {
  // taskId: string
  // status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED'
  // projectId: string
});
```

**When to use:** Move the task card to the new column on all connected clients' Kanban boards.

---

#### `comment:new`

Fired when a comment is posted on any task in the project.

```js
socket.on('comment:new', ({ comment, taskId }) => {
  // comment: full comment object with author and mentions
  // taskId: string
});
```

**When to use:** Append the new comment to the comment thread if the user has that task open.

---

*Last updated: based on v1 implementation. Append new decisions below this line.*
