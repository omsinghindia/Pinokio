import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

function parseLocation (body) {
  try {
    const o = JSON.parse(body || '{}');
    if (typeof o.lat === 'number' && typeof o.lng === 'number') return o;
  } catch {
    /* ignore */
  }
  return null;
}

function useSignedMediaUrl (filePath) {
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (!filePath) {
      setUrl(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setErr(null);
    setUrl(null);
    (async () => {
      const { data, error } = await supabase.storage
        .from('chat-media')
        .createSignedUrl(filePath, 3600);
      if (cancelled) return;
      if (error) {
        setErr(error.message);
        return;
      }
      setUrl(data?.signedUrl || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [filePath]);

  return { url, err };
}

export default function ChatMessageBubble ({
  message: m,
  mine,
  onMediaLoad,
  partnerAvatarUrl,
  partnerInitial
}) {
  const t = new Date(m.created_at);
  const timeStr = t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const kind = m.kind || 'text';
  const { url: mediaUrl, err: mediaErr } = useSignedMediaUrl(m.file_path);

  const bubbleInner = (
    <>
      {kind === 'image' && m.file_path ? (
        mediaErr ? (
          <p className="text-xs text-red-200/90">Could not load image</p>
        ) : mediaUrl ? (
          <img
            src={mediaUrl}
            alt=""
            className="mb-1 max-h-64 w-full max-w-[min(100%,280px)] rounded-xl object-cover"
            onLoad={onMediaLoad}
          />
        ) : (
          <div className="mb-1 h-36 w-52 max-w-full animate-pulse rounded-xl bg-white/10" />
        )
      ) : null}

      {kind === 'audio' && m.file_path ? (
        mediaErr ? (
          <p className="text-xs text-red-200/90">Could not load audio</p>
        ) : mediaUrl ? (
          <audio
            controls
            src={mediaUrl}
            className="mb-1 h-9 w-full max-w-[260px]"
            onLoadedMetadata={onMediaLoad}
          />
        ) : (
          <div className="mb-1 h-9 w-52 animate-pulse rounded-lg bg-white/10" />
        )
      ) : null}

      {kind === 'file' && m.file_path ? (
        mediaErr ? (
          <p className="text-xs text-red-200/90">Could not load file</p>
        ) : mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noreferrer"
            download={m.file_name || true}
            className={`mb-1 flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium underline ${
              mine ? 'bg-white/15' : 'bg-black/25'
            }`}
          >
            <span className="text-lg">📎</span>
            <span className="truncate">{m.file_name || 'Download file'}</span>
          </a>
        ) : (
          <div className="mb-1 h-10 w-full animate-pulse rounded-lg bg-white/10" />
        )
      ) : null}

      {kind === 'location' ? (() => {
        const loc = parseLocation(m.body);
        if (!loc) {
          return <p className="text-sm">📍 Location</p>;
        }
        const maps = `https://www.google.com/maps?q=${loc.lat},${loc.lng}`;
        return (
          <a
            href={maps}
            target="_blank"
            rel="noreferrer"
            className={`mb-1 flex flex-col gap-1 rounded-xl px-3 py-2 text-sm font-medium ${
              mine ? 'bg-white/15' : 'bg-black/30'
            }`}
          >
            <span className="text-base">📍 {loc.label || 'Shared location'}</span>
            <span className="text-[11px] font-normal opacity-80">Open in Maps →</span>
          </a>
        );
      })() : null}

      {kind === 'text' ? (
        <p className="whitespace-pre-wrap break-words">{m.body}</p>
      ) : null}

      {(kind === 'image' || kind === 'audio' || kind === 'file') &&
      (m.body || '').trim() ? (
        <p className="mt-1 whitespace-pre-wrap break-words text-[13px] opacity-90">
          {m.body}
        </p>
      ) : null}

      <p
        className={`mt-1 text-[10px] tabular-nums ${
          mine ? 'text-white/65' : 'text-white/45'
        }`}
      >
        {timeStr}
      </p>
    </>
  );

  if (mine) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-binokio-accent to-rose-600 px-3 py-2 shadow-lg shadow-binokio-accent/20">
          {bubbleInner}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-2">
      <div className="mt-1 h-8 w-8 shrink-0 overflow-hidden rounded-full border border-white/10 bg-white/5">
        {partnerAvatarUrl ? (
          <img src={partnerAvatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs font-semibold text-white/60">
            {partnerInitial || '?'}
          </div>
        )}
      </div>
      <div className="max-w-[calc(85%-2.5rem)] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.07] px-3 py-2 backdrop-blur-sm">
        {bubbleInner}
      </div>
    </div>
  );
}
