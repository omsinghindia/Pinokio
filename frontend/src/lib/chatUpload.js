import { supabase } from './supabaseClient';

/**
 * Upload a file to private chat-media bucket. Path must be {matchId}/{userId}/...
 */
export async function uploadChatAttachment (file, matchId, userId) {
  const safe = (file.name || 'file').replace(/[^\w.\-]/g, '_').slice(0, 120);
  const path = `${matchId}/${userId}/${crypto.randomUUID()}_${safe}`;
  const { error } = await supabase.storage.from('chat-media').upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false
  });
  if (error) throw error;
  return path;
}

export function pickRecorderMime () {
  if (typeof MediaRecorder === 'undefined') return '';
  const c = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus'
  ];
  for (const t of c) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}
