interface Member {
  userId: string;
  user: { name: string };
}

// Extracts @mention userIds from comment content matched against project members.
// Matches @FirstLast or @firstname (case-insensitive, ignores spaces in name).
export const parseMentions = (content: string, members: Member[]): string[] => {
  const mentionedIds = new Set<string>();
  const regex = /@(\S+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const token = match[1].toLowerCase().replace(/[^a-z0-9]/g, '');
    const found = members.find(
      (m) => m.user.name.toLowerCase().replace(/\s+/g, '') === token
    );
    if (found) mentionedIds.add(found.userId);
  }

  return Array.from(mentionedIds);
};
