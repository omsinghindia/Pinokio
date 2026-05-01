import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { supabase } from '../lib/supabaseClient';
import { uploadChatAttachment, pickRecorderMime } from '../lib/chatUpload';
import { ICE_SERVERS } from '../lib/webrtc';
import LoadingSpinner from '../components/LoadingSpinner';
import ChatMessageBubble from '../components/chat/ChatMessageBubble';

/**
 * Matched-only chat: messages via Socket.IO (persisted by server to Supabase).
 * Rich media: images, documents, voice notes, static + live location.
 */
export default function Chat () {
  const { matchId } = useParams();
  const { user } = useAuth();
  const socket = useSocket();
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

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [inCall, setInCall] = useState(false);
  const [incomingOffer, setIncomingOffer] = useState(null);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);

  const endCallLocal = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setInCall(false);
    setIncomingOffer(null);
    setCamOn(true);
    setMicOn(true);
  }, []);

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
    endCallLocal();

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
      endCallLocal();
    };
  }, [matchId, user.id, endCallLocal]);

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
    if (!socket || !matchId || !partnerId) return;

    function onMessage (row) {
      if (!row?.id) return;
      if (String(row.match_id) !== String(matchId)) return;
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row];
      });
    }

    function onPresence ({ userId, status, matchId: mid }) {
      if (mid !== matchId || userId !== partnerId) return;
      setPartnerOnline(status === 'online');
    }

    function onTypingStart ({ userId, matchId: mid }) {
      if (mid !== matchId || userId !== partnerId) return;
      setTyping(true);
    }

    function onTypingStop ({ userId, matchId: mid }) {
      if (mid !== matchId || userId !== partnerId) return;
      setTyping(false);
    }

    function onOffer ({ fromUserId, matchId: mid, sdp }) {
      if (mid !== matchId || fromUserId !== partnerId) return;
      setIncomingOffer(sdp);
    }

    function onAnswer ({ fromUserId, matchId: mid, sdp }) {
      if (mid !== matchId || fromUserId !== partnerId) return;
      if (!pcRef.current) return;
      pcRef.current.setRemoteDescription(new RTCSessionDescription(sdp)).catch(
        console.error
      );
    }

    function onIce ({ fromUserId, matchId: mid, candidate }) {
      if (mid !== matchId || fromUserId !== partnerId) return;
      if (!candidate || !pcRef.current) return;
      pcRef.current
        .addIceCandidate(new RTCIceCandidate(candidate))
        .catch(console.error);
    }

    function onCallReject ({ fromUserId, matchId: mid }) {
      if (mid !== matchId || fromUserId !== partnerId) return;
      endCallLocal();
    }

    function onCallEnd ({ fromUserId, matchId: mid }) {
      if (mid !== matchId || fromUserId !== partnerId) return;
      endCallLocal();
    }

    function onLiveLoc (p) {
      if (p.matchId !== matchId || p.userId !== partnerId) return;
      setPartnerLiveLoc({ lat: p.lat, lng: p.lng, at: p.at || Date.now() });
    }

    function onLiveStop (p) {
      if (p.matchId !== matchId || p.userId !== partnerId) return;
      setPartnerLiveLoc(null);
    }

    socket.on('chat:message', onMessage);
    socket.on('user:presence', onPresence);
    socket.on('typing:start', onTypingStart);
    socket.on('typing:stop', onTypingStop);
    socket.on('webrtc:offer', onOffer);
    socket.on('webrtc:answer', onAnswer);
    socket.on('webrtc:ice', onIce);
    socket.on('call:reject', onCallReject);
    socket.on('call:end', onCallEnd);
    socket.on('location:live', onLiveLoc);
    socket.on('location:live:stop', onLiveStop);

    return () => {
      socket.off('chat:message', onMessage);
      socket.off('user:presence', onPresence);
      socket.off('typing:start', onTypingStart);
      socket.off('typing:stop', onTypingStop);
      socket.off('webrtc:offer', onOffer);
      socket.off('webrtc:answer', onAnswer);
      socket.off('webrtc:ice', onIce);
      socket.off('call:reject', onCallReject);
      socket.off('call:end', onCallEnd);
      socket.off('location:live', onLiveLoc);
      socket.off('location:live:stop', onLiveStop);
    };
  }, [socket, matchId, partnerId, endCallLocal]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    const id = last?.id;
    if (id === lastMessageIdRef.current && messages.length) return;
    lastMessageIdRef.current = id;
    scrollToBottom(messages.length > 2);
  }, [messages, scrollToBottom]);

  const emitChat = useCallback(
    (payload, rollback) => {
      if (!socket) return;
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
    if (!socket || !input.trim() || uploading || recording) return;
    const text = input.trim();
    setInput('');
    socket.emit('typing:stop', { matchId });
    emitChat({ kind: 'text', body: text }, () => setInput(text));
  }

  function onInputChange (v) {
    setInput(v);
    if (!socket || !matchId) return;
    socket.emit('typing:start', { matchId });
    if (typingTimeout.current) {
      clearTimeout(typingTimeout.current);
    }
    typingTimeout.current = setTimeout(() => {
      socket.emit('typing:stop', { matchId });
    }, 1200);
  }

  async function sendFile (kind, file) {
    if (!socket || !matchId || !user?.id || uploading || recording) return;
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
    if (!socket || !matchId) return;
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
    if (!socket || uploading || recording) return;
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

  async function startCall () {
    if (!socket || !partnerId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && socket) {
          socket.emit('webrtc:ice', {
            toUserId: partnerId,
            matchId,
            candidate: ev.candidate.toJSON()
          });
        }
      };

      pc.ontrack = (ev) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = ev.streams[0];
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call:invite', { toUserId: partnerId, matchId });
      socket.emit('webrtc:offer', {
        toUserId: partnerId,
        matchId,
        sdp: {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp
        }
      });

      setInCall(true);
    } catch (err) {
      console.error(err);
      setSendError('Could not access camera/microphone.');
      endCallLocal();
    }
  }

  async function acceptCall () {
    if (!socket || !partnerId || !incomingOffer) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && socket) {
          socket.emit('webrtc:ice', {
            toUserId: partnerId,
            matchId,
            candidate: ev.candidate.toJSON()
          });
        }
      };

      pc.ontrack = (ev) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = ev.streams[0];
        }
      };

      await pc.setRemoteDescription(new RTCSessionDescription(incomingOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc:answer', {
        toUserId: partnerId,
        matchId,
        sdp: {
          type: pc.localDescription.type,
          sdp: pc.localDescription.sdp
        }
      });

      setIncomingOffer(null);
      setInCall(true);
    } catch (err) {
      console.error(err);
      setSendError('Could not answer call.');
      endCallLocal();
    }
  }

  function rejectCall () {
    if (socket && partnerId) {
      socket.emit('call:reject', { toUserId: partnerId, matchId });
    }
    setIncomingOffer(null);
  }

  function endCall () {
    if (socket && partnerId) {
      socket.emit('call:end', { toUserId: partnerId, matchId });
    }
    endCallLocal();
  }

  function toggleMic () {
    const s = localStreamRef.current;
    if (!s) return;
    const audio = s.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setMicOn(audio.enabled);
    }
  }

  function toggleCam () {
    const s = localStreamRef.current;
    if (!s) return;
    const video = s.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setCamOn(video.enabled);
    }
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
    <div className="flex min-h-[calc(100dvh-10.5rem)] flex-col gap-3 sm:min-h-[calc(100dvh-9rem)] sm:gap-4 lg:h-[calc(100vh-8rem)] lg:min-h-0">
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

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-binokio-card/90 to-black/40 px-4 py-3 backdrop-blur-md">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to="/matches"
            className="shrink-0 text-sm text-binokio-muted transition hover:text-white"
          >
            ←
          </Link>
          <div className="h-11 w-11 shrink-0 overflow-hidden rounded-full border-2 border-binokio-accent/30 bg-black/40 shadow-lg shadow-black/40">
            {partner?.avatar_url ? (
              <img
                src={partner.avatar_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg font-semibold text-white/50">
                {partnerInitial}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="font-display truncate text-lg font-bold leading-tight">
              {partner?.full_name || 'Chat'}
            </h1>
            <p className="text-xs text-binokio-muted">
              {partnerOnline ? (
                <span className="text-emerald-400">Online</span>
              ) : (
                <span>Offline</span>
              )}
              {typing ? ' · typing…' : null}
              {liveSharing ? ' · sharing live location' : null}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={startCall}
          disabled={!socket || inCall || !!incomingOffer}
          className="min-h-[44px] shrink-0 rounded-full bg-binokio-accent px-4 py-2 text-sm font-semibold shadow-lg shadow-binokio-accent/25 disabled:opacity-40"
        >
          Video call
        </button>
      </div>

      {incomingOffer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-binokio-card p-6 text-center">
            <p className="text-lg font-semibold">Incoming call</p>
            <p className="mt-1 text-sm text-binokio-muted">
              {partner?.full_name || 'Your match'} wants to connect
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={rejectCall}
                className="rounded-full border border-white/20 px-5 py-2 text-sm"
              >
                Decline
              </button>
              <button
                type="button"
                onClick={acceptCall}
                className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-black"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inCall ? (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/95 p-4">
          <div className="relative flex-1 overflow-hidden rounded-2xl bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="h-full w-full object-cover"
            />
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="absolute bottom-4 right-4 h-28 w-36 rounded-xl border border-white/20 object-cover shadow-lg"
            />
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={toggleMic}
              className="rounded-full bg-white/10 px-4 py-2 text-sm"
            >
              {micOn ? 'Mute' : 'Unmute'}
            </button>
            <button
              type="button"
              onClick={toggleCam}
              className="rounded-full bg-white/10 px-4 py-2 text-sm"
            >
              {camOn ? 'Camera off' : 'Camera on'}
            </button>
            <button
              type="button"
              onClick={endCall}
              className="rounded-full bg-red-500 px-6 py-2 text-sm font-semibold"
            >
              End call
            </button>
          </div>
        </div>
      ) : null}

      <div className="relative flex flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-binokio-card/50 to-black/30 shadow-xl shadow-black/20">
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
            <div className="absolute bottom-full left-2 z-20 mb-2 w-[min(calc(100vw-2rem),280px)] rounded-2xl border border-white/10 bg-binokio-card/95 p-2 shadow-2xl backdrop-blur-md">
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

          <div className="flex items-end gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setAttachOpen((o) => !o)}
              disabled={!socket || uploading || recording}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg leading-none transition hover:bg-white/10 disabled:opacity-40"
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
                  : 'Message, caption, or tap + to attach…'
              }
              disabled={uploading || recording}
              className="min-h-[44px] flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-2.5 text-base outline-none ring-binokio-accent focus:ring-2 sm:text-sm"
            />
            {recording ? null : (
              <button
                type="button"
                onClick={() =>
                  recording ? stopRecording(true) : startRecording()
                }
                disabled={!socket || uploading}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg transition hover:bg-white/10 disabled:opacity-40"
                aria-label="Voice message"
              >
                🎤
              </button>
            )}
            <button
              type="submit"
              disabled={!socket || !input.trim() || uploading || recording}
              className="min-h-[44px] shrink-0 rounded-2xl bg-binokio-accent px-4 py-2 text-sm font-semibold shadow-md shadow-binokio-accent/20 disabled:opacity-40"
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
