import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import { Lock, AlertCircle, Check, Copy, RefreshCw, Search, Tv, X } from 'lucide-react';
import { CategoryItem, ChannelItem } from '../types/iptv';
import { isFreeAzerbaijanGroup, ParsedChannelWithUrl } from '../lib/m3uClient';

interface WebPlayerModalProps {
  channel: ChannelItem | null;
  channels: ParsedChannelWithUrl[];
  categories: CategoryItem[];
  username: string;
  password: string;
  isActiveSubscriber: boolean;
  onSelectChannel: (channel: ChannelItem) => void;
  onBrowsePlans: () => void;
  onClose: () => void;
}

export const WebPlayerModal: React.FC<WebPlayerModalProps> = ({
  channel,
  channels,
  categories,
  username,
  password,
  isActiveSubscriber,
  onSelectChannel,
  onBrowsePlans,
  onClose,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLabel, setStatusLabel] = useState('Yayım axını qoşulur...');
  const [directStreamUrl, setDirectStreamUrl] = useState<string>('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lockedChannelMsg, setLockedChannelMsg] = useState<string | null>(null);

  // Sidebar channel filtering
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('ALL');

  const filteredChannels = useMemo(() => {
    const q = search.trim().toLowerCase();
    return channels
      .filter((ch) => {
        if (!isActiveSubscriber && !isFreeAzerbaijanGroup(ch.group) && selectedCat === 'ALL' && !q) {
          return false;
        }
        if (selectedCat !== 'ALL' && ch.categoryId !== selectedCat) return false;
        if (q) {
          return (
            ch.name.toLowerCase().includes(q) ||
            ch.group.toLowerCase().includes(q) ||
            ch.chno.includes(q)
          );
        }
        return true;
      })
      .slice(0, 200);
  }, [channels, search, selectedCat, isActiveSubscriber]);

  useEffect(() => {
    if (!channel || !videoRef.current) return;
    const video = videoRef.current;
    let hls: Hls | null = null;
    let cancelled = false;

    setErrorMsg(null);
    setLoading(true);
    setStatusLabel('Yayım axını qoşulur...');

    const startPlayback = async () => {
      let candidates: string[] = [];
      let rawUpstream = (channel as ParsedChannelWithUrl).url || '';
      const isFreeAz = isFreeAzerbaijanGroup(channel.group);

      try {
        const streamQuery =
          username && password
            ? `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&streamId=${channel.streamId}`
            : `streamId=${channel.streamId}`;
        const res = await fetch(`/api/channel-stream?${streamQuery}`);
        const contentType = res.headers.get('content-type') || '';
        if (res.ok && contentType.includes('application/json')) {
          const data = (await res.json()) as {
            url?: string;
            httpsUrl?: string;
            proxyUrl?: string;
          };
          if (data.url) rawUpstream = data.url;
          if (data.httpsUrl) candidates.push(data.httpsUrl);
          if (data.proxyUrl) candidates.push(data.proxyUrl);
        }
      } catch {
        // Static hosting fallback below
      }

      if (rawUpstream) {
        setDirectStreamUrl(rawUpstream);
        const httpsCandidate = rawUpstream.replace(/^http:\/\//i, 'https://');
        if (!candidates.includes(httpsCandidate)) {
          candidates.unshift(httpsCandidate);
        }
        if (window.location.protocol === 'http:' && !candidates.includes(rawUpstream)) {
          candidates.push(rawUpstream);
        }
      }

      if (candidates.length === 0) {
        candidates = [
          isFreeAz
            ? `/api/hls-proxy?freeAz=1&streamId=${channel.streamId}`
            : `/api/hls-proxy?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&streamId=${channel.streamId}`,
        ];
      }

      if (cancelled) return;

      const tryCandidateAt = (index: number) => {
        if (cancelled) return;
        if (index >= candidates.length) {
          setLoading(false);
          setErrorMsg(
            'Bu kanalın mənbə serveri hazırda brauzer oxudulmasına məhdudiyyət qoyur. Aşağıdan kanal linkini kopyalayıb VLC / IPTV Smarters-də aça və ya siyahıdan başqa kanalı seçə bilərsiniz.'
          );
          return;
        }

        const src = candidates[index];
        if (hls) {
          hls.destroy();
          hls = null;
        }

        if (Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            manifestLoadingTimeOut: 9000,
          });
          hls.loadSource(src);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (cancelled) return;
            setLoading(false);
            setErrorMsg(null);
            setStatusLabel('Canlı Yayım');
            void video.play().catch(() => {
              // User can press play manually if autoplay is blocked
            });
          });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (cancelled) return;
            if (data.fatal) {
              tryCandidateAt(index + 1);
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = src;
          const onLoaded = () => {
            if (cancelled) return;
            setLoading(false);
            setErrorMsg(null);
            setStatusLabel('Canlı Yayım');
            void video.play().catch(() => {});
          };
          const onErr = () => {
            video.removeEventListener('loadedmetadata', onLoaded);
            video.removeEventListener('error', onErr);
            tryCandidateAt(index + 1);
          };
          video.addEventListener('loadedmetadata', onLoaded, { once: true });
          video.addEventListener('error', onErr, { once: true });
        } else {
          setLoading(false);
          setErrorMsg('Brauzeriniz HLS canlı yayım formatını dəstəkləmir.');
        }
      };

      tryCandidateAt(0);
    };

    void startPlayback();

    return () => {
      cancelled = true;
      if (hls) {
        hls.destroy();
      }
    };
  }, [channel, username, password, retryCount]);

  if (!channel) return null;

  const copyStreamUrl = async () => {
    if (!directStreamUrl) return;
    try {
      await navigator.clipboard.writeText(directStreamUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Canlı TV Pleyeri"
    >
      <div className="w-full max-w-[1280px] h-[90vh] max-h-[780px] bg-[#11151E] border border-white/15 rounded-xl overflow-hidden flex flex-col">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Tv className="w-4 h-4 text-amber-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-white truncate">{channel.name}</h3>
              <p className="text-xs text-slate-400 truncate tabular-nums">
                {channel.group} · Kanal #{channel.chno} ·{' '}
                {!isActiveSubscriber ? 'Pulsuz Açıq Efir · ' : ''}
                {loading ? statusLabel : errorMsg ? 'Bağlantı xətası' : statusLabel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {directStreamUrl && (
              <button
                type="button"
                onClick={() => void copyStreamUrl()}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#090B10] border border-white/10 rounded-lg text-slate-200 hover:border-amber-400/60 transition-colors"
              >
                {copiedUrl ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedUrl ? 'Link Kopyalandı' : 'Yayım Linkini Kopyala'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setRetryCount((c) => c + 1)}
              aria-label="Yayımı yenilə"
              className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Pleyeri bağla"
              className="p-2 text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main Split: Video Stage + Channel Zap Sidebar */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12">
          {/* Video Stage */}
          <div className="lg:col-span-8 bg-black relative flex items-center justify-center min-h-[240px]">
            <video
              ref={videoRef}
              controls
              playsInline
              className="w-full h-full object-contain"
            />

            {loading && !errorMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 gap-2 text-xs text-slate-200">
                <RefreshCw className="w-5 h-5 text-amber-400 animate-spin" />
                <span>{statusLabel}</span>
              </div>
            )}

            {errorMsg && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-black/85 gap-4">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p className="text-xs sm:text-sm text-slate-200 max-w-md leading-relaxed">
                  {errorMsg}
                </p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRetryCount((c) => c + 1)}
                    className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors"
                  >
                    Yenidən Yoxla
                  </button>
                  {directStreamUrl && (
                    <button
                      type="button"
                      onClick={() => void copyStreamUrl()}
                      className="px-4 py-2 text-xs font-medium bg-[#11151E] border border-white/15 text-white rounded-lg hover:border-amber-400/60 transition-colors"
                    >
                      {copiedUrl ? 'Kopyalandı' : 'M3U8 Linkini Kopyala (VLC)'}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Channel Switcher Sidebar */}
          <aside className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-white/10 bg-[#0D1017] flex flex-col min-h-0">
            <div className="p-3 border-b border-white/10 space-y-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Kanal axtar..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#11151E] border border-white/10 rounded-md text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                aria-label="Kateqoriya seçin"
                className="w-full px-2.5 py-1.5 text-xs bg-[#11151E] border border-white/10 rounded-md text-slate-200 focus:outline-none focus:border-amber-400"
              >
                <option value="ALL">Bütün Kateqoriyalar ({channels.length})</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {lockedChannelMsg && (
                <div className="p-3 bg-amber-500/10 border-b border-amber-400/30 text-xs space-y-2">
                  <p className="text-amber-200">{lockedChannelMsg}</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLockedChannelMsg(null);
                        onClose();
                        onBrowsePlans();
                      }}
                      className="px-3 py-1.5 bg-amber-500 text-slate-950 font-semibold rounded text-[11px] hover:bg-amber-400"
                    >
                      Paketləri Seç
                    </button>
                    <button
                      type="button"
                      onClick={() => setLockedChannelMsg(null)}
                      className="text-slate-400 hover:text-white text-[11px]"
                    >
                      Bağla
                    </button>
                  </div>
                </div>
              )}
              {filteredChannels.map((ch) => {
                const isCurrent = ch.streamId === channel.streamId;
                const chFree = isFreeAzerbaijanGroup(ch.group);
                const chUnlocked = isActiveSubscriber || chFree;
                return (
                  <button
                    key={`${ch.streamId}-${ch.chno}`}
                    type="button"
                    onClick={() => {
                      if (chUnlocked) {
                        setLockedChannelMsg(null);
                        onSelectChannel(ch);
                      } else {
                        setLockedChannelMsg(
                          `"${ch.name}" kanalı yalnız paket abunəçiləri üçündür. AZƏRBAYCAN kanalları isə pulsuz açıqdır.`
                        );
                      }
                    }}
                    className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-left transition-colors ${
                      isCurrent
                        ? 'bg-amber-500/15 text-amber-200'
                        : 'hover:bg-white/[0.03] text-slate-200'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{ch.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        {ch.group} · #{ch.chno}
                        {chFree && !isActiveSubscriber ? ' · Pulsuz' : ''}
                      </p>
                    </div>
                    {isCurrent ? (
                      <span className="text-[10px] font-medium text-amber-400 shrink-0">
                        İzlənir
                      </span>
                    ) : !chUnlocked ? (
                      <Lock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
