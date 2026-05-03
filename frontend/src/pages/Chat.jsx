import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { supabase } from '../lib/supabaseClient';
import { uploadChatAttachment, pickRecorderMime } from '../lib/chatUpload';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';

/**
 * Matched-only chat: messages via Socket.IO (persisted by server to Supabase).
 * Rich media: images, documents, voice notes, static + live location.
 */
export default function Chat () {
  const { matchId } = useParams();
  const { user } = useAuth();
  const { socket, status: realtimeStatus, error: realtimeError } = useSocket();
  const socketReady = Boolean(socket?.connected);
  const socketRef = useRef(socket);
  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  const [partner, setPartner] = useState(null);
  const [partnerId, setPartnerId] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sendError, setSendError] = useState('');
  const [partnerOnline, setPartnerOnline] = useState(false);
  const [typing, setTyping] = useState(false);
  const typingTimeout = useRef(null);
  const chatListRef = useRef(null);
  const lastMessageIdRef = useRef(null);

  const [attachOpen, setAttachOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const recordIntervalRef = useRef(null);
  const recorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordStreamRef = useRef(null);

  const imageInputRef = useRef(null);
  const docInputRef = useRef(null);

  const [liveSharing, setLiveSharing] = useState(false);
  const liveWatchIdRef = useRef(null);
  const lastLiveEmitRef = useRef(0);
  const [partnerLiveLoc, setPartnerLiveLoc] = useState(null);

  const partnerIdRef = useRef(null);

  useEffect(() => {
    partnerIdRef.current = partnerId;
  }, [partnerId]);

  const stopLiveShare = useCallback((mid) => {
    const id = mid ?? matchId;
    if (liveWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(liveWatchIdRef.current);
      liveWatchIdRef.current = null;
    }
    if (socketRef.current && id) {
      socketRef.current.emit('location:live:stop', { matchId: id });
    }
    setLiveSharing(false);
  }, [matchId]);

  const scrollToBottom = useCallback((smooth) => {
    const el = chatListRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setMessages([]);
    setPartner(null);
    setPartnerId(null);
    setInput('');
    setSendError('');
    setPartnerOnline(false);
    setTyping(false);
    setAttachOpen(false);
    setPartnerLiveLoc(null);
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
      typingTimeout.current = null;
    }
    if (liveWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(liveWatchIdRef.current);
      liveWatchIdRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.emit('location:live:stop', { matchId });
    }
    setLiveSharing(false);

    (async () => {
      const { data: match, error: mErr } = await supabase
        .from('matches')
        .select('id, user_low, user_high')
        .eq('id', matchId)
        .maybeSingle();

      if (cancelled) return;
      if (mErr || !match) {
        setLoadError(mErr?.message || 'Match not found');
        setLoading(false);
        return;
      }

      const isParticipant =
        match.user_low === user.id || match.user_high === user.id;
      if (!isParticipant) {
        setLoadError('You are not part of this conversation.');
        setLoading(false);
        return;
      }

      const pid = match.user_low === user.id ? match.user_high : match.user_low;
      setPartnerId(pid);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', pid)
        .maybeSingle();

      if (cancelled) return;
      setPartner(profile);

      const { data: msgs, error: msgErr } = await supabase
        .from('messages')
        .select('*')
        .eq('match_id', matchId)
        .order('created_at', { ascending: true });

      if (cancelled) return;
      if (msgErr) {
        setLoadError(msgErr.message);
      } else {
        setMessages(msgs || []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
      if (liveWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(liveWatchIdRef.current);
        liveWatchIdRef.current = null;
      }
      socketRef.current?.emit('location:live:stop', { matchId });
    };
  }, [matchId, user.id]);

  useEffect(() => {
    if (!socket || !matchId) return;
    const doJoin = () => {
      socket.emit('join:match', { matchId }, (res) => {
        if (!res?.ok) {
          console.warn('BINOKIO: join:match failed — check backend and that you are in this match');
        }
      });
    };
    if (socket.connected) {
      doJoin();
    } else {
      socket.on('connect', doJoin);
    }
    return () => {
      socket.off('connect', doJoin);
      socket.emit('leave:match', { matchId });
    };
  }, [socket, matchId]);

  useEffect(() => {
    if (!socket || !matchId) return;

    function onMessage (row) {
      if (!row?.id) return;
      if (String(row.match_id) !== String(matchId)) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row];
      });
    }

    function onPresence ({ userId, status, matchId: mid }) {
      if (String(mid) !== String(matchId)) return;
      if (!userId || String(userId) === String(user.id)) return;
      if (partnerIdRef.current && String(userId) !== String(partnerIdRef.current)) {
        return;
      }
      setPartnerOnline(status === 'online');
    }

    function onTypingStart ({ userId, matchId: mid }) {
      if (String(mid) !== String(matchId)) return;
      if (!userId || String(userId) === String(user.id)) return;
      if (partnerIdRef.current && String(userId) !== String(partnerIdRef.current)) {
        return;
      }
      setTyping(true);
    }

    function onTypingStop ({ userId, matchId: mid }) {
      if (String(mid) !== String(matchId)) return;
      if (!userId || String(userId) === String(user.id)) return;
      if (partnerIdRef.current && String(userId) !== String(partnerIdRef.current)) {
        return;
      }
      setTyping(false);
    }

    function onLiveLoc (p) {
      if (String(p.matchId) !== String(matchId)) return;
      if (!p.userId || String(p.userId) === String(user.id)) return;
      if (partnerIdRef.current && String(p.userId) !== String(partnerIdRef.current)) {
        return;
      }
      setPartnerLiveLoc({ lat: p.lat, lng: p.lng, at: p.at || Date.now() });
    }

    function onLiveStop (p) {
      if (String(p.matchId) !== String(matchId)) return;
      if (!p.userId || String(p.userId) === String(user.id)) return;
      if (partnerIdRef.current && String(p.userId) !== String(partnerIdRef.current)) {
        return;
      }
      setPartnerLiveLoc(null);
    }

    socket.on('chat:message', onMessage);
    socket.on('user:presence', onPresence);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('location:live', onLiveLoc);
    socket.on('location:live:stop', onLiveStop);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('user:presence', onPresence);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('location:live', onLiveLoc);
      socket.off('location:live:stop', onLiveStop);
    };
  }, [socket, matchId, user.id]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const id = last?.id;
    if (id === lastMessageIdRef.current && messages.length) return;
    lastMessageIdRef.current = id;
    scrollToBottom(messages.length > 2);
  }, [messages, scrollToBottom]);

  const emitChat = useCallback(
    (payload, rollback) => {
      if (!socket?.connected) return;
      setSendError('');
      socket.emit('chat:send', { matchId, ...payload }, (res) => {
        if (!res?.ok) {
          setSendError(res?.error || 'Could not send');
          rollback?.();
          return;
        }
        if (res.message && String(res.message.match_id) === String(matchId)) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === res.message.id)) return prev;
            return [...prev, res.message];
          });
        }
      });
    },
    [socket, matchId]
  );

  function sendChat (e) {
    e.preventDefault();
    if (!socket?.connected || !input.trim() || uploading || recording) return;
    const text = input.trim();
    setInput('');
    socket.emit('typing:stop', { matchId });
    emitChat({ kind: 'text', body: text }, () => setInput(text));
  }

  function onInputChange (v) {
    setInput(v);
    if (!socket?.connected || !matchId) return;
    socket.emit('typing:start', { matchId });
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing:stop', { matchId });
    }, 1200);
  }

  async function sendFile (kind, file) {
    if (!socket?.connected || !matchId || !user?.id || uploading || recording) return;
    setAttachOpen(false);
    setUploading(true);
    setSendError('');
    try {
      const path = await uploadChatAttachment(file, matchId, user.id);
      const caption = input.trim();
      if (caption) setInput('');
      emitChat({
        kind,
        body: caption,
        filePath: path,
        fileName: file.name,
        mimeType: file.type || null
      });
    } catch (err) {
      console.error(err);
      setSendError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onImagePick (e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) sendFile('image', f);
  }

  function onDocPick (e) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) sendFile('file', f);
  }

  function sendStaticLocation () {
    if (!navigator.geolocation) {
      setSendError('Location not supported in this browser.');
      return;
    }
    setAttachOpen(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        emitChat({
          kind: 'location',
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            label: 'Pinned location'
          })
        });
      },
      (err) => setSendError(err.message || 'Could not read location'),
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  function startLiveLocation () {
    if (!socket?.connected || !matchId) return;
    if (!navigator.geolocation) {
      setSendError('Location not supported.');
      return;
    }
    setAttachOpen(false);
    lastLiveEmitRef.current = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const now = Date.now();
        if (now - lastLiveEmitRef.current < 7500) return;
        lastLiveEmitRef.current = now;
        socket.emit('location:live', {
          matchId,
          lat: latitude,
          lng: longitude
        });
      },
      (err) => {
        console.warn(err);
        setSendError(err.message || 'Live location error');
        stopLiveShare();
      },
      { enableHighAccuracy: true, maximumAge: 4000 }
    );
    liveWatchIdRef.current = watchId;
    setLiveSharing(true);
    socket.emit('location:live', {
      matchId,
      lat: 0,
      lng: 0
    });
  }

  async function startRecording () {
    if (!socket?.connected || uploading || recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordStreamRef.current = stream;
      const mime = pickRecorderMime();
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      recordChunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size) recordChunksRef.current.push(ev.data);
      };
      mr.start(300);
      recorderRef.current = mr;
      setRecording(true);
      setRecordSecs(0);
      recordIntervalRef.current = window.setInterval(() => {
        setRecordSecs((s) => s + 1);
      }, 1000);
    } catch (err) {
      console.error(err);
      setSendError('Microphone access denied or unavailable.');
    }
  }

  async function stopRecording (shouldSend) {
    if (!recording) return;
    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    const mr = recorderRef.current;
    recorderRef.current = null;
    setRecording(false);
    setRecordSecs(0);

    const stream = recordStreamRef.current;
    recordStreamRef.current = null;
    stream?.getTracks().forEach((t) => t.stop());

    if (!mr) return;

    await new Promise((resolve) => {
      mr.onstop = resolve;
      mr.stop();
    });

    if (!shouldSend) {
      recordChunksRef.current = [];
      return;
    }

    const blob = new Blob(recordChunksRef.current, {
      type: mr.mimeType || 'audio/webm'
    });
    recordChunksRef.current = [];
    if (blob.size < 16) {
      setSendError('Recording too short.');
      return;
    }
    const ext = blob.type.includes('webm') ? 'webm' : 'm4a';
    const file = new File([blob], `voice-${Date.now()}.${ext}`, {
      type: blob.type || 'audio/webm'
    });
    await sendFile('audio', file);
  }

  const partnerInitial =
    partner?.full_name?.trim()?.[0]?.toUpperCase() || '?';

  if (loading) {
    return <LoadingSpinner />;
  }

  if (loadError) {
    return (
      <div className="rounded-2xl bg-red-500/20 p-6 text-red-100">
        {loadError}
        <Link to="/matches" className="mt-4 block text-binokio-accent underline">
          Back to matches
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 sm:gap-3">
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onImagePick}
      />
      <input
        ref={docInputRef}
        type="file"
        className="hidden"
        onChange={onDocPick}
      />

      <div className="flex shrink-0 items-center gap-2 rounded-2xl border border-white/10 bg-gradient-to-r from-binokio-card/90 to-black/40 px-3 py-2.5 backdrop-blur-md sm:gap-3 sm:px-4 sm:py-3">
        <Link
          to="/matches"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-sm text-binokio-muted transition hover:border-white/20 hover:text-white"
          aria-label="Back to matches"
        >
          ←
        </Link>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-binokio-accent/30 bg-black/40 shadow-lg shadow-black/40 sm:h-11 sm:w-11">
          {partner?.avatar_url ? (
            <img
              src={partner.avatar_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-base font-semibold text-white/50 sm:text-lg">
              {partnerInitial}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-base font-bold leading-tight sm:text-lg">
            {partner?.full_name || 'Chat'}
          </h1>
          <p className="truncate text-[11px] text-binokio-muted sm:text-xs">
            {realtimeStatus === 'error' ? (
              <span className="text-red-300/90">Chat unavailable</span>
            ) : !socketReady ? (
              <span className="text-amber-300/90">Connecting…</span>
            ) : partnerOnline ? (
              <span className="text-emerald-400">Online</span>
            ) : (
              <span>Offline</span>
            )}
            {typing ? ' · typing…' : null}
            {liveSharing ? ' · sharing live location' : null}
          </p>
        </div>
      </div>

      {realtimeStatus === 'error' && realtimeError ? (
        <div className="rounded-xl border border-red-500/40 bg-red-950/50 px-3 py-2 text-xs text-red-100 sm:text-sm">
          {realtimeError}
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-binokio-card/50 to-black/30 shadow-xl shadow-black/20">
        {partnerLiveLoc ? (
          <div className="flex items-center justify-between gap-2 border-b border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs sm:text-sm">
            <span className="text-emerald-100">
              📍 {partner?.full_name || 'Match'} is sharing live location
            </span>
            <a
              href={`https://www.google.com/maps?q=${partnerLiveLoc.lat},${partnerLiveLoc.lng}`}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 font-semibold text-emerald-300 underline"
            >
              Open map
            </a>
          </div>
        ) : null}

        <div
          ref={chatListRef}
          className="chat-scroll flex-1 space-y-3 overflow-y-auto p-3 sm:p-4"
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-3xl">👋</p>
              <p className="mt-2 text-sm font-medium text-white/80">
                Start the conversation
              </p>
              <p className="mt-1 max-w-xs text-xs text-binokio-muted">
                Send text, photos, files, voice notes, or your location. Live
                location updates your match in real time.
              </p>
            </div>
          ) : null}
          {messages.map((m) => (
            <ChatMessageBubble
              key={m.id}
              message={m}
              mine={m.sender_id === user.id}
              partnerAvatarUrl={partner?.avatar_url}
              partnerInitial={partnerInitial}
              onMediaLoad={() => scrollToBottom(true)}
            />
          ))}
        </div>

        {sendError ? (
          <p className="px-4 pb-1 text-xs text-red-300">{sendError}</p>
        ) : null}

        {recording ? (
          <div className="flex items-center justify-between gap-2 border-t border-red-500/30 bg-red-500/10 px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <span className="text-sm font-medium text-red-100">
                Recording… {recordSecs}s
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => stopRecording(false)}
                className="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => stopRecording(true)}
                className="rounded-full bg-binokio-accent px-3 py-1.5 text-xs font-semibold"
              >
                Send
              </button>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={sendChat}
          className="relative border-t border-white/10 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3"
        >
          {attachOpen ? (
            <div className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-[min(70dvh,320px)] overflow-y-auto rounded-2xl border border-white/10 bg-binokio-card/95 p-2 shadow-2xl backdrop-blur-md sm:left-2 sm:right-auto sm:w-[min(calc(100vw-2rem),280px)]">
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-binokio-muted">
                Attach
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    imageInputRef.current?.click();
                    setAttachOpen(false);
                  }}
                  className="rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10"
                >
                  🖼 Photo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    docInputRef.current?.click();
                    setAttachOpen(false);
                  }}
                  className="rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10"
                >
                  📄 Document
                </button>
                <button
                  type="button"
                  onClick={sendStaticLocation}
                  className="rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10"
                >
                  📍 Location
                </button>
                <button
                  type="button"
                  onClick={startLiveLocation}
                  className="rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10"
                >
                  📡 Live location
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex min-w-0 items-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setAttachOpen((o) => !o)}
              disabled={!socketReady || uploading || recording}
              className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg leading-none transition hover:bg-white/10 disabled:opacity-40"
              aria-label="Attach"
            >
              +
            </button>
            <input
              value={input}
              onChange={(e) => onInputChange(e.target.value)}
              placeholder={
                uploading
                  ? 'Uploading…'
                  : 'Message…'
              }
              disabled={uploading || recording}
              autoComplete="off"
              autoCorrect="off"
              className="min-h-[44px] min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-3 py-2.5 text-base outline-none ring-binokio-accent focus:ring-2 sm:px-4 sm:text-sm"
            />
            {recording ? null : (
              <button
                type="button"
                onClick={() =>
                  recording ? stopRecording(true) : startRecording()
                }
                disabled={!socketReady || uploading}
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg transition hover:bg-white/10 disabled:opacity-40"
                aria-label="Voice message"
              >
                🎤
              </button>
            )}
            <button
              type="submit"
              disabled={!socketReady || !input.trim() || uploading || recording}
              className="min-h-[44px] shrink-0 touch-manipulation rounded-2xl bg-binokio-accent px-3 py-2 text-sm font-semibold shadow-md shadow-binokio-accent/20 disabled:opacity-40 sm:px-4"
            >
              Send
            </button>
          </div>
        </form>
      </div>

      {liveSharing ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 sm:text-sm">
          <span>You are sharing live location (updates every ~8s).</span>
          <button
            type="button"
            onClick={() => stopLiveShare()}
            className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white"
          >
            Stop sharing
          </button>
        </div>
      ) : null}
    </div>
  );
}
