import React, { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { X, Tv, AlertCircle } from 'lucide-react';
import { ChannelItem } from '../types/iptv';

interface WebPlayerModalProps {
  channel: ChannelItem | null;
  username: string;
  password: string;
  onClose: () => void;
}

export const WebPlayerModal: React.FC<WebPlayerModalProps> = ({
  channel,
  username,
  password,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channel || !videoRef.current) return;
    const video = videoRef.current;
    setErrorMsg(null);
    setLoading(true);

    const streamUrl = `/api/hls-proxy?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&streamId=${channel.streamId}`;
    let hls: Hls | null = null;

    if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setLoading(false);
        void video.play().catch(() => {
          // Autoplay may wait for user click on play
        });
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          setLoading(false);
          setErrorMsg(
            'Bu kanal hazırda brauzer pleyerində cavab vermir. IPTV Smarters və ya VLC ilə birbaşa Xtream girişinizdən izləyə bilərsiniz.'
          );
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        setLoading(false);
        void video.play().catch(() => {});
      });
    } else {
      setLoading(false);
      setErrorMsg('Brauzeriniz HLS yayımını dəstəkləmir.');
    }

    return () => {
      if (hls) {
        hls.destroy();
      }
    };
  }, [channel, username, password]);

  if (!channel) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl bg-[#11151E] border border-white/15 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-3 min-w-0">
            <Tv className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{channel.name}</h3>
              <p className="text-xs text-slate-400 truncate">
                {channel.group} · Kanal #{channel.chno}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Pleyeri bağla"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative aspect-video bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            controls
            playsInline
            className="w-full h-full object-contain"
          />

          {loading && !errorMsg && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-xs text-slate-300">
              Yayım axını qoşulur...
            </div>
          )}

          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/85 gap-3">
              <AlertCircle className="w-8 h-8 text-amber-400" />
              <p className="text-sm text-slate-200 max-w-md">{errorMsg}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
