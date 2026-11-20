import React, { useMemo, useState } from 'react';
import { Search, Tv, RefreshCw, ChevronDown, Eye, EyeOff, Play, Lock, Clock } from 'lucide-react';
import { CategoryItem, ChannelItem } from '../types/iptv';
import { isFreeAzerbaijanGroup } from '../lib/m3uClient';

interface ChannelDirectoryProps {
  channels: ChannelItem[];
  categories: CategoryItem[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSelectChannelToWatch: (channel: ChannelItem) => void;
  subscriptionState: 'active' | 'pending' | 'none';
  onGoToDashboard: () => void;
  onBrowsePlans: () => void;
}

const PAGE_SIZE = 48;

export const ChannelDirectory: React.FC<ChannelDirectoryProps> = ({
  channels,
  categories,
  loading,
  error,
  onRefresh,
  onSelectChannelToWatch,
  subscriptionState,
  onGoToDashboard,
  onBrowsePlans,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [showAdult, setShowAdult] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [brokenLogos, setBrokenLogos] = useState<Record<number, boolean>>({});
  const [watchNotice, setWatchNotice] = useState<{ channelName: string; state: 'pending' | 'none' } | null>(null);

  const visibleCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (!showAdult && cat.name.toUpperCase().includes('ADULT')) {
        return false;
      }
      return true;
    });
  }, [categories, showAdult]);

  const filteredChannels = useMemo(() => {
    const query = search.trim().toLowerCase();
    return channels.filter((ch) => {
      if (!showAdult && ch.group.toUpperCase().includes('ADULT')) {
        return false;
      }
      if (selectedCategory !== 'ALL' && ch.categoryId !== selectedCategory) {
        return false;
      }
      if (query) {
        return (
          ch.name.toLowerCase().includes(query) ||
          ch.group.toLowerCase().includes(query) ||
          ch.chno.includes(query)
        );
      }
      return true;
    });
  }, [channels, search, selectedCategory, showAdult]);

  const displayedChannels = useMemo(() => {
    return filteredChannels.slice(0, visibleCount);
  }, [filteredChannels, visibleCount]);

  const handleCategoryChange = (catId: string) => {
    setSelectedCategory(catId);
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <section id="kanallar" className="py-20 border-t border-white/10">
      <div className="max-w-[1200px] mx-auto px-6">
        {/* Section header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
          <div className="max-w-2xl">
            <p className="text-xs font-medium tracking-wide text-amber-400 mb-2">
              02. Tam Kanal Siyahısı
            </p>
            <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white text-balance">
              Abunə olmadan əvvəl bütün kanalları yoxlayın
            </h2>
            <p className="mt-3 text-slate-400 text-sm md:text-base leading-relaxed">
              <span className="text-emerald-400 font-medium">AZƏRBAYCAN kateqoriyası tam pulsuz və qeydiyyatsızdır</span> — dərhal saytda canlı izləyə bilərsiniz. Digər{' '}
              <span className="text-white font-medium tabular-nums">
                {channels.length.toLocaleString('az-AZ')}
              </span>{' '}
              Türkiyə, İdman, Kino və Rusiya kanalı paketiniz aktivləşdikdə açılır.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowAdult((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 bg-[#11151E] border border-white/10 rounded-lg hover:border-white/25 transition-colors whitespace-nowrap shrink-0"
            >
              {showAdult ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{showAdult ? '18+ Gizlət' : '18+ Göstər'}</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-[#11151E] border border-white/10 rounded-lg hover:border-amber-400/50 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Yenilə</span>
            </button>
          </div>
        </div>

        {/* Search + Stats bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setVisibleCount(PAGE_SIZE);
              }}
              placeholder="Kanal adı, kateqoriya və ya nömrə axtar (məs: Xəzər, beIN)..."
              className="w-full pl-10 pr-4 py-2.5 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400 transition-colors"
            />
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-400 tabular-nums">
            <span>Göstərilən: {displayedChannels.length}</span>
            <span aria-hidden="true">·</span>
            <span>Tapılan: {filteredChannels.length}</span>
            <span aria-hidden="true">·</span>
            <span>Kateqoriya: {visibleCategories.length}</span>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-6 border-b border-white/10">
          <button
            type="button"
            onClick={() => handleCategoryChange('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
              selectedCategory === 'ALL'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-[#11151E] text-slate-300 hover:text-white border border-white/10'
            }`}
          >
            Hamısı ({channels.filter((c) => showAdult || !c.group.toUpperCase().includes('ADULT')).length})
          </button>
          {visibleCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryChange(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                selectedCategory === cat.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#11151E] text-slate-300 hover:text-white border border-white/10'
              }`}
            >
              {cat.name} ({cat.count})
            </button>
          ))}
        </div>

        {watchNotice && (
          <div className="mb-6 p-4 bg-[#11151E] border border-amber-500/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {watchNotice.state === 'pending' ? (
                <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <Lock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="text-xs space-y-1">
                <p className="font-semibold text-white">
                  {watchNotice.channelName}
                </p>
                <p className="text-slate-300">
                  {watchNotice.state === 'pending'
                    ? 'Abunəliyiniz hazırda Admin təsdiqi gözləyir. Təsdiqləndikdən dərhal sonra bütün kanalları birbaşa saytda izləyə biləcəksiniz.'
                    : 'Kanalları saytda canlı izləmək üçün Həftəlik (5 AZN) və ya Aylıq (15 AZN) paketlərdən birini aktivləşdirin.'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {watchNotice.state === 'pending' ? (
                <button
                  type="button"
                  onClick={onGoToDashboard}
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap"
                >
                  İstifadəçi Panelinə Keç
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onBrowsePlans}
                  className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap"
                >
                  Paketləri Seç
                </button>
              )}
              <button
                type="button"
                onClick={() => setWatchNotice(null)}
                className="px-3 py-2 text-xs text-slate-400 hover:text-white"
              >
                Bağla
              </button>
            </div>
          </div>
        )}

        {/* States */}
        {loading && channels.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[76px] bg-[#11151E] border border-white/10 rounded-lg animate-pulse"
              />
            ))}
          </div>
        ) : error && channels.length === 0 ? (
          <div className="p-8 bg-[#11151E] border border-red-500/30 rounded-lg text-center space-y-3">
            <p className="text-sm text-red-300">{error}</p>
            <button
              type="button"
              onClick={onRefresh}
              className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors"
            >
              Yenidən Yüklə
            </button>
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="p-10 bg-[#11151E] border border-white/10 rounded-lg text-center space-y-2">
            <p className="text-sm font-medium text-white">Axtarışa uyğun kanal tapılmadı</p>
            <p className="text-xs text-slate-400">
              Başqa açar söz yoxlayın və ya bütün kateqoriyaları seçin.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {displayedChannels.map((ch) => {
                const logoFailed = brokenLogos[ch.streamId] || !ch.logo;
                const initials = ch.name
                  .replace(/^(AZ:|TR:|GOLD:|RU:)\s*/i, '')
                  .slice(0, 2)
                  .toUpperCase();

                const isFreeAz = isFreeAzerbaijanGroup(ch.group);
                const canWatch = subscriptionState === 'active' || isFreeAz;

                return (
                  <div
                    key={`${ch.streamId}-${ch.chno}`}
                    className="group flex items-center gap-3.5 p-3.5 bg-[#11151E] border border-white/10 rounded-lg hover:border-amber-400/40 transition-colors"
                  >
                    <div className="w-11 h-11 rounded-md bg-[#090B10] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden">
                      {!logoFailed ? (
                        <img
                          src={ch.logo}
                          alt={ch.name}
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          onError={() =>
                            setBrokenLogos((prev) => ({ ...prev, [ch.streamId]: true }))
                          }
                          className="w-full h-full object-contain p-1"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Tv className="w-4 h-4 mb-0.5 text-amber-400/80" />
                          <span className="text-[9px] font-mono font-semibold">{initials}</span>
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-white truncate" title={ch.name}>
                        {ch.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 truncate">
                        <span className="truncate">{ch.group}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums shrink-0">#{ch.chno}</span>
                        {isFreeAz && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-emerald-400 font-medium shrink-0">Pulsuz</span>
                          </>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (canWatch) {
                          setWatchNotice(null);
                          onSelectChannelToWatch(ch);
                        } else {
                          setWatchNotice({
                            channelName: ch.name,
                            state: subscriptionState === 'pending' ? 'pending' : 'none',
                          });
                        }
                      }}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded transition-colors shrink-0 ${
                        isFreeAz && subscriptionState !== 'active'
                          ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                          : canWatch
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'bg-[#090B10] text-slate-300 border border-white/15 hover:border-amber-400/50 hover:text-white'
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span>{isFreeAz && subscriptionState !== 'active' ? 'Pulsuz İzlə' : 'İzlə'}</span>
                    </button>
                  </div>
                );
              })}
            </div>

            {visibleCount < filteredChannels.length && (
              <div className="mt-8 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
                  className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium text-white bg-[#11151E] border border-white/15 rounded-lg hover:border-amber-400/60 transition-colors"
                >
                  <span>
                    Daha çox göstər ({Math.min(PAGE_SIZE, filteredChannels.length - visibleCount)} kanal)
                  </span>
                  <ChevronDown className="w-4 h-4 text-amber-400" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};
