import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AtSign } from 'lucide-react';
import { format } from 'date-fns';
import { mentionService } from '../../services/mention.service';
import { Header } from '../../components/layout/Header';
import { Avatar } from '../../components/ui/Avatar';
import { PageSpinner } from '../../components/ui/Spinner';

export function MentionsPage() {
  const { data: mentions = [], isLoading } = useQuery({
    queryKey: ['mentions', 'me'],
    queryFn: mentionService.getMine,
  });

  if (isLoading) return <PageSpinner />;

  return (
    <div className="flex flex-col">
      <Header title="Mentions" subtitle={`${mentions.length} mention${mentions.length !== 1 ? 's' : ''} of you`} />

      <div className="p-6 max-w-2xl">
        {mentions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-indigo-50 p-4 mb-4">
              <AtSign className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-semibold text-gray-900">No mentions yet</h3>
            <p className="mt-1 text-sm text-gray-500">When someone @mentions you in a comment, it will show up here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mentions.map((m) => (
              <Link
                key={m.id}
                to={`/projects/${m.comment.task.projectId}/tasks/${m.comment.task.id}`}
                className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
              >
                <Avatar name={m.comment.author?.name ?? '?'} size="md" className="shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    <span className="font-medium">{m.comment.author?.name ?? 'Someone'}</span> mentioned you in{' '}
                    <span className="font-medium">{m.comment.task.title}</span>
                  </p>
                  <p className="mt-1 text-sm text-gray-500 line-clamp-2">{m.comment.content}</p>
                  <p className="mt-1 text-xs text-gray-400">{format(new Date(m.comment.createdAt), 'MMM d, yyyy · h:mm a')}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
