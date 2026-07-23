import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, UserX, Search, Plus, Trash2, Tag } from 'lucide-react';
import { userService } from '../../services/user.service';
import { labelService } from '../../services/label.service';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import type { User, Role, Label } from '../../types';

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

function UserRow({ user, currentUser, onChangeRole, onDeactivate }: {
  user: User;
  currentUser: User;
  onChangeRole: (u: User) => void;
  onDeactivate: (id: string) => void;
}) {
  const isSelf = user.id === currentUser.id;
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Avatar name={user.name} avatarUrl={user.avatarUrl} size="md" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-gray-900">{user.name}</p>
          {!user.isActive && <span className="text-xs text-red-500 font-medium">(Inactive)</span>}
        </div>
        <p className="text-xs text-gray-400">{user.email}</p>
      </div>
      <Badge variant={user.role} />
      {!isSelf && currentUser.role === 'ADMIN' && (
        <div className="flex items-center gap-1 ml-2">
          <Button variant="ghost" size="sm" onClick={() => onChangeRole(user)} title="Change role">
            <Shield className="h-4 w-4" />
          </Button>
          {user.isActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { if (confirm(`Deactivate ${user.name}?`)) onDeactivate(user.id); }}
              title="Deactivate"
              className="text-red-500 hover:bg-red-50"
            >
              <UserX className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function LabelRow({ label, canDelete, onDelete }: {
  label: Label;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-3">
      <span className="h-4 w-4 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
      <p className="flex-1 text-sm font-medium text-gray-900">{label.name}</p>
      <span className="text-xs text-gray-400 font-mono">{label.color}</span>
      {canDelete && (
        <button
          onClick={() => { if (confirm(`Delete label "${label.name}"?`)) onDelete(label.id); }}
          className="ml-2 rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function TeamPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [newRole, setNewRole] = useState<Role>('TEAM_MEMBER');
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(PRESET_COLORS[0]);
  const [labelError, setLabelError] = useState<string | null>(null);

  const canManageLabels = me?.role === 'ADMIN' || me?.role === 'TEAM_LEAD';

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => userService.list({ limit: 100 }),
  });

  const { data: labels = [], isLoading: labelsLoading } = useQuery({
    queryKey: ['labels'],
    queryFn: () => labelService.list(),
    enabled: canManageLabels,
  });

  const { mutate: changeRole, isPending: changingRole } = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) => userService.updateRole(id, role),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      setRoleTarget(null);
    },
  });

  const { mutate: deactivate } = useMutation({
    mutationFn: (id: string) => userService.deactivate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const { mutate: createLabel, isPending: creatingLabel } = useMutation({
    mutationFn: () => labelService.create({ name: labelName.trim(), color: labelColor }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      setLabelModalOpen(false);
      setLabelName('');
      setLabelColor(PRESET_COLORS[0]);
      setLabelError(null);
    },
    onError: (err: unknown) => {
      setLabelError(err instanceof Error ? err.message : 'Failed to create label');
    },
  });

  const { mutate: deleteLabel } = useMutation({
    mutationFn: (id: string) => labelService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['labels'] }),
  });

  if (isLoading) return <PageSpinner />;

  const users = (data?.users ?? []).filter(
    (u) => !search || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col">
      <Header title="Team" subtitle={`${data?.total ?? 0} members`} />

      <div className="p-6 max-w-3xl space-y-8">
        {/* Users section */}
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email..."
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {users.length === 0 ? (
              <p className="px-5 py-6 text-sm text-center text-gray-400">No users found</p>
            ) : (
              users.map((u) => (
                <UserRow
                  key={u.id}
                  user={u}
                  currentUser={me!}
                  onChangeRole={(target) => { setRoleTarget(target); setNewRole(target.role); }}
                  onDeactivate={(id) => deactivate(id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Labels section */}
        {canManageLabels && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">Labels</h2>
                <span className="text-xs text-gray-400">({labels.length})</span>
              </div>
              <Button size="sm" onClick={() => setLabelModalOpen(true)}>
                <Plus className="h-4 w-4" /> New Label
              </Button>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {labelsLoading ? (
                <p className="px-5 py-4 text-sm text-center text-gray-400">Loading…</p>
              ) : labels.length === 0 ? (
                <p className="px-5 py-6 text-sm text-center text-gray-400">
                  No labels yet — create one to tag tasks
                </p>
              ) : (
                labels.map((l) => (
                  <LabelRow
                    key={l.id}
                    label={l}
                    canDelete={me?.role === 'ADMIN'}
                    onDelete={(id) => deleteLabel(id)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Change role modal */}
      <Modal isOpen={!!roleTarget} onClose={() => setRoleTarget(null)} title={`Change role — ${roleTarget?.name}`}>
        <div className="space-y-4">
          <Select
            label="New role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as Role)}
            options={[
              { value: 'ADMIN', label: 'Admin' },
              { value: 'TEAM_LEAD', label: 'Team Lead' },
              { value: 'TEAM_MEMBER', label: 'Team Member' },
            ]}
          />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setRoleTarget(null)}>Cancel</Button>
            <Button
              isLoading={changingRole}
              onClick={() => roleTarget && changeRole({ id: roleTarget.id, role: newRole })}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* New label modal */}
      <Modal
        isOpen={labelModalOpen}
        onClose={() => { setLabelModalOpen(false); setLabelName(''); setLabelColor(PRESET_COLORS[0]); setLabelError(null); }}
        title="New Label"
      >
        <div className="space-y-4">
          {labelError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600">
              {labelError}
            </div>
          )}
          <Input
            label="Label name"
            placeholder="e.g. Bug, Feature, Urgent"
            value={labelName}
            onChange={(e) => setLabelName(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-gray-700">Color</label>
            <div className="flex flex-wrap gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setLabelColor(c)}
                  className={`h-7 w-7 rounded-full transition-transform ${labelColor === c ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-gray-500">Custom hex:</span>
              <input
                value={labelColor}
                onChange={(e) => setLabelColor(e.target.value)}
                placeholder="#6366f1"
                className="w-28 rounded-md border border-gray-300 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
              <span className="h-5 w-5 rounded-full border border-gray-200" style={{ backgroundColor: labelColor }} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" type="button" onClick={() => { setLabelModalOpen(false); setLabelName(''); setLabelColor(PRESET_COLORS[0]); setLabelError(null); }}>
              Cancel
            </Button>
            <Button
              isLoading={creatingLabel}
              disabled={!labelName.trim()}
              onClick={() => createLabel()}
            >
              Create Label
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
