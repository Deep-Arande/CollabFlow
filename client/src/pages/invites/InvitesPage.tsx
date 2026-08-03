import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { format } from 'date-fns';
import { inviteService } from '../../services/invite.service';
import { Header } from '../../components/layout/Header';
import { Button } from '../../components/ui/Button';
import { Avatar } from '../../components/ui/Avatar';
import { PageSpinner } from '../../components/ui/Spinner';
import type { InviteStatus } from '../../types';

export function InvitesPage() {
  const qc = useQueryClient();

  const { data: invites = [], isLoading } = useQuery({
    queryKey: ['invites', 'pending'],
    queryFn: inviteService.getPending,
  });

  const { mutate: respond, isPending } = useMutation({
    mutationFn: ({ id, response }: { id: string; response: Extract<InviteStatus, 'ACCEPTED' | 'DECLINED'> }) =>
      inviteService.respond(id, response),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', 'pending'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex flex-col">
      <Header title="Invites" subtitle={`${invites.length} pending invite${invites.length !== 1 ? 's' : ''}`} />

      <div className="p-6 max-w-2xl">
        {invites.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-indigo-50 p-4 mb-4">
              <Mail className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">No pending invites</h3>
            <p className="mt-1 text-sm text-gray-500">When someone invites you to a project, it will show up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {invites.map((inv) => (
              <div key={inv.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-4">
                <Avatar name={inv.inviter?.name ?? '?'} size="md" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    <span className="font-medium">{inv.inviter?.name ?? 'Someone'}</span> invited you to join{' '}
                    <span className="font-medium">{inv.project?.name ?? 'a project'}</span>
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{format(new Date(inv.addedAt), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={isPending}
                    onClick={() => respond({ id: inv.id, response: 'DECLINED' })}
                  >
                    Decline
                  </Button>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => respond({ id: inv.id, response: 'ACCEPTED' })}
                  >
                    Accept
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
