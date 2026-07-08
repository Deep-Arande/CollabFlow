import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
const BUCKET = 'attachments';

export const uploadFile = async (
  buffer: Buffer,
  path: string,
  mimeType: string
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, { contentType: mimeType, upsert: false });

  if (error || !data) throw new Error(error?.message ?? 'Upload failed');
  return data.path;
};

export const getSignedUrl = async (path: string, expiresIn = 120): Promise<string> => {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data) throw new Error(error?.message ?? 'Failed to generate signed URL');
  return data.signedUrl;
};

export const deleteFile = async (path: string): Promise<void> => {
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) throw new Error(error.message);
};
