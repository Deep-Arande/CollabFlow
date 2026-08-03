import api from '../config/api';
import type { ApiResponse, PendingInvite, InviteStatus } from '../types';

export const inviteService = {
  async getPending() {
    const res = await api.get<ApiResponse<{ invites: PendingInvite[] }>>('/invites/pending');
    return res.data.data?.invites ?? [];
  },

  async respond(membershipId: string, response: Extract<InviteStatus, 'ACCEPTED' | 'DECLINED'>) {
    await api.patch(`/invites/${membershipId}/respond`, { response });
  },
};
