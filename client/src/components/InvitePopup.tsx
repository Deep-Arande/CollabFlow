import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { inviteService } from '../services/invite.service';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Avatar } from './ui/Avatar';
import type { InviteStatus } from '../types';

// Non-blocking popup shown on app load. Dismissing ("Later") leaves the invite
// PENDING — it stays in the Invites page and the sidebar badge.
export function InvitePopup() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data: invites = [] } = useQuery({
    queryKey: ['invites', 'pending'],
    queryFn: inviteService.getPending,
    refetchInterval: 60_000,
  });

  const { mutate: respond, isPending } = useMutation({
    mutationFn: ({ id, response }: { id: string; response: Extract<InviteStatus, 'ACCEPTED' | 'DECLINED'> }) =>
      inviteService.respond(id, response),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', 'pending'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  // First invite that hasn't been dismissed this session.
  const current = invites.find((inv) => !dismissed.has(inv.id));
  if (!current) return null;

  const dismiss = () => setDismissed((prev) => new Set(prev).add(current.id));

  return (
    <Modal isOpen onClose={dismiss} title="Project invite">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Avatar name={current.inviter?.name ?? '?'} size="md" />
          <p className="text-sm text-gray-700">
            <span className="font-medium">{current.inviter?.name ?? 'Someone'}</span> invited you to join{' '}
            <span className="font-medium">{current.project?.name ?? 'a project'}</span>
          </p>
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>Later</Button>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={isPending}
              onClick={() => respond({ id: current.id, response: 'DECLINED' })}
            >
              Decline
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                respond(
                  { id: current.id, response: 'ACCEPTED' },
                  { onSuccess: () => navigate(`/projects/${current.projectId}`) },
                )
              }
            >
              Accept
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
