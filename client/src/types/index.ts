export type Role = 'ADMIN' | 'TEAM_LEAD' | 'TEAM_MEMBER';
export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'COMPLETED';
export type ProjectMemberRole = 'LEAD' | 'MEMBER';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  isActive: boolean;
  createdAt: string;
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
  _count?: { tasks: number; members: number };
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  role: ProjectMemberRole;
  addedAt: string;
  user?: User;
}

export interface Label {
  id: string;
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

export interface Attachment {
  id: string;
  taskId: string;
  uploadedBy: string;
  filePath: string;
  fileType: string;
  fileName: string;
  createdAt: string;
  url?: string;
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
  recentActivity: ActivityLog[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}
