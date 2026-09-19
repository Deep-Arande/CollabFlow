export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
export type ProjectRole = 'LEAD' | 'MEMBER';
export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  createdAt?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  dueDate: string;
  status: ProjectStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creator?: User;
  members?: ProjectMember[];
  myRole?: ProjectRole | null;
  _count?: { tasks: number; members: number };
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectRole;
  status: InviteStatus;
  invitedBy: string;
  addedAt: string;
  respondedAt?: string | null;
  user?: User;
  inviter?: { id: string; name: string; avatarUrl?: string };
}

export interface PendingInvite {
  id: string;
  projectId: string;
  role: ProjectRole;
  status: InviteStatus;
  addedAt: string;
  project?: { id: string; name: string; description: string };
  inviter?: { id: string; name: string; avatarUrl?: string };
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  assignedTo?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  assignee?: User;
  creator?: User;
  comments?: Comment[];
  attachments?: Attachment[];
  labels?: { label: Label }[];
  project?: { id: string; name: string };
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: User;
  mentions?: { mentionedUser: User }[];
}

export type AttachmentScope = 'TASK' | 'PROJECT';

export interface Attachment {
  id: string;
  taskId?: string | null;
  projectId: string;
  uploadedBy: string;
  filePath: string;
  fileType: string;
  fileName: string;
  scope?: AttachmentScope;
  createdAt: string;
  url?: string;
  uploader?: { id: string; name: string };
}

export interface CatchMeUpResult {
  summary: string;
  generatedAt: string;
  cached?: boolean;
}

export interface AssistantSource {
  id: string;
  fileName: string;
}

export interface AssistantAnswer {
  answer: string;
  sources: AssistantSource[];
}

export interface Mention {
  id: string;
  commentId: string;
  mentionedUserId: string;
  comment: {
    id: string;
    content: string;
    createdAt: string;
    author?: User;
    task: { id: string; title: string; projectId: string };
  };
}

export interface ActivityLog {
  id: string;
  projectId?: string;
  userId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  user?: User;
}

export interface DashboardStats {
  totalProjects: number;
  activeTasks: number;
  completedTasks: number;
  overdueTasksCount: number;
  myTasks: Task[];
  overdueTasks: Task[];
  recentActivity: ActivityLog[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}
