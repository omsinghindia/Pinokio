/** One-line preview for inbox / Discover strip (matches message kinds). */
export function formatLastMessagePreview (msg) {
  if (!msg) return '';
  const kind = msg.kind || 'text';
  const cap = (msg.body || '').trim();
  switch (kind) {
    case 'image':
      return cap ? `📷 ${cap}` : '📷 Photo';
    case 'file':
      return msg.file_name ? `📎 ${msg.file_name}` : '📎 File';
    case 'audio':
      return '🎤 Voice';
    case 'location':
      return '📍 Location';
    default:
      return msg.body || '';
  }
}
