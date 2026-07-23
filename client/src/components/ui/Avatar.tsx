interface AvatarProps {
  name: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizes = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

const colors = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-pink-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-sky-500',
];

function colorFor(name: string) {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % colors.length;
  return colors[hash];
}

export function Avatar({ name, avatarUrl, size = 'md', className = '' }: AvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`rounded-full object-cover ${sizes[size]} ${className}`}
      />
    );
  }
  return (
    <div
      className={`flex items-center justify-center rounded-full font-semibold text-white ${colorFor(name)} ${sizes[size]} ${className}`}
    >
      {initials(name)}
    </div>
  );
}
