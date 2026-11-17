import React, { useMemo, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Activity,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  Lock,
  MailCheck,
  Play,
  Plus,
  Receipt,
  ShieldAlert,
  Tv,
} from 'lucide-react';
import {
  ChannelItem,
  DispatchNotification,
  PaymentRecord,
  SubscriptionRecord,
} from '../types/iptv';
import {
  buildM3uUrl,
  formatAzDate,
  getPublicXtreamHost,
  getRemainingDays,
  syncSubscriptionToServer,
} from '../lib/xtreamUtils';
import { downloadDirectM3uFile } from '../lib/m3uClient';

interface UserDashboardProps {
  user: User | null;
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  notifications: DispatchNotification[];
  channels: ChannelItem[];
  loading: boolean;
  onSignIn: () => void;
  onBrowsePlans: () => void;
  onWatchChannel: (channel: ChannelItem, sub: SubscriptionRecord) => void;
}

export const UserDashboard: React.FC<UserDashboardProps> = ({
  user,
  subscriptions,
  payments,
  notifications,
  channels,
  loading,
  onSignIn,
  onBrowsePlans,
  onWatchChannel,
}) => {
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [guideTab, setGuideTab] = useState<'smarters' | 'tivimate' | 'vlc'>('smarters');
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const activeSub = useMemo(() => {
    if (subscriptions.length === 0) return null;
    if (selectedSubId) {
      const found = subscriptions.find((s) => s.id === selectedSubId);
      if (found) return found;
    }
    return subscriptions[0];
  }, [subscriptions, selectedSubId]);

  const previewChannels = useMemo(() => {
    return channels.filter((c) => !c.group.toUpperCase().includes('ADULT')).slice(0, 8);
  }, [channels]);

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1800);
    } catch {
      // Fallback ignored
    }
  };

  const runDiagnostics = async (sub: SubscriptionRecord, publicHost: string) => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      await syncSubscriptionToServer(sub);
      const localRes = await fetch(
        `/player_api.php?username=${encodeURIComponent(sub.xtreamUsername)}&password=${encodeURIComponent(sub.xtreamPassword)}`
      );
      const contentType = localRes.headers.get('content-type') || '';
      if (!localRes.ok || !contentType.includes('application/json')) {
        setDiagResult({
          ok: false,
          message:
            'Sayt hazırda statik hostinqdə (məs. GitHub Pages) işləyir — burada PHP/Node Xtream API serveri yoxdur. Bunun əvəzinə "Birbaşa M3U Faylı Yüklə" düyməsini sıxıb faylı endirin və VLC / Televizo / TiviMate-də dərhal açın.',
        });
        return;
      }
      const localJson = (await localRes.json()) as {
        user_info?: { auth?: number; message?: string };
      };

      if (localJson.user_info?.auth !== 1) {
        setDiagResult({
          ok: false,
          message:
            localJson.user_info?.message ||
            'Hesabınız hələ Admin tərəfindən təsdiqlənməyib. Admin Panelindən təsdiq edildikdən sonra aktivləşəcək.',
        });
        return;
      }

      const pubCheckRes = await fetch(
        `/api/xtream/check-public?host=${encodeURIComponent(publicHost)}&username=${encodeURIComponent(sub.xtreamUsername)}&password=${encodeURIComponent(sub.xtreamPassword)}`
      );
      const pubCheck = (await pubCheckRes.json()) as {
        publicReachable?: boolean;
        reason?: string;
      };

      if (pubCheck.publicReachable) {
        setDiagResult({
          ok: true,
          message:
            'Xtream Server URL və şifrəniz tam aktivdir. IPTV Smarters, TiviMate və Televizo tətbiqlərində istifadə edə bilərsiniz.',
        });
      } else {
        setDiagResult({
          ok: false,
          message:
            'Hesabınız lokal serverdə aktivdir, lakin ictimai paylaşım linki (ais-pre) hələ yayımlanmayıb. Xarici TV/telefon pleyerlərinin Server URL ilə qoşulması üçün AI Studio-da tətbiqi Share / Publish edin, və ya "Birbaşa M3U Faylı Yüklə" düyməsi ilə faylı endirib dərhal VLC / Televizo / TiviMate-də açın.',
        });
      }
    } catch (err) {
      setDiagResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Bağlantı testi uğursuz oldu.',
      });
    } finally {
      setDiagLoading(false);
    }
  };

  if (!user) {
    return (
      <section className="py-20 px-6 max-w-[1200px] mx-auto">
        <div className="max-w-xl mx-auto bg-[#11151E] border border-white/10 rounded-xl p-10 text-center space-y-5">
          <Tv className="w-8 h-8 text-amber-400 mx-auto" />
          <h2 className="font-display text-2xl font-semibold text-white">
            İstifadəçi Panelinə Daxil Olun
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Avtomatik yaradılan Xtream Codes giriş məlumatlarınızı, ödəniş qəbzlərinizi və abunəlik statusunuzu görmək üçün hesabınıza daxil olun.
          </p>
          <button
            type="button"
            onClick={onSignIn}
            className="px-6 py-2.5 text-sm font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors"
          >
            Google ilə Daxil Ol
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <section className="py-12 px-6 max-w-[1200px] mx-auto space-y-6">
        <div className="h-32 bg-[#11151E] border border-white/10 rounded-xl animate-pulse" />
        <div className="h-64 bg-[#11151E] border border-white/10 rounded-xl animate-pulse" />
      </section>
    );
  }

  if (!activeSub) {
    return (
      <section className="py-20 px-6 max-w-[1200px] mx-auto">
        <div className="max-w-xl mx-auto bg-[#11151E] border border-white/10 rounded-xl p-10 text-center space-y-5">
          <Plus className="w-8 h-8 text-amber-400 mx-auto" />
          <h2 className="font-display text-2xl font-semibold text-white">
            Hələ Aktiv Abunəliyiniz Yoxdur
          </h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            Həftəlik (7 gün) və ya Aylıq (30 gün) paketlərdən birini seçib qeydiyyatdan keçin. Ödənişdən dərhal sonra Xtream Codes məlumatlarınız avtomatik yaradılacaq.
          </p>
          <button
            type="button"
            onClick={onBrowsePlans}
            className="px-6 py-2.5 text-sm font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors"
          >
            Paketləri Seç
          </button>
        </div>
      </section>
    );
  }

  const remainingDays =
    activeSub.status === 'active' ? getRemainingDays(activeSub.expiresAt) : 0;
  const publicHost = getPublicXtreamHost(activeSub.xtreamHost);
  const publicM3uUrl = buildM3uUrl(
    publicHost,
    activeSub.xtreamUsername,
    activeSub.xtreamPassword
  );

  return (
    <section className="py-10 px-6 max-w-[1200px] mx-auto space-y-8">
      {/* Top dashboard header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <p className="text-xs text-slate-400">
            İstifadəçi Paneli · {user.email}
          </p>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">
            Xoş gəlmisiniz, {activeSub.userName}
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {subscriptions.length > 1 && (
            <select
              value={activeSub.id}
              onChange={(e) => {
                setSelectedSubId(e.target.value);
                setDiagResult(null);
              }}
              aria-label="Abunəlik seçin"
              className="px-3 py-2 text-xs bg-[#11151E] border border-white/15 rounded-lg text-white focus:outline-none focus:border-amber-400"
            >
              {subscriptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.planName} ({s.xtreamUsername})
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={onBrowsePlans}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Yeni Paket Al</span>
          </button>
        </div>
      </div>

      {/* Status Notice Banner */}
      {activeSub.status === 'pending' && (
        <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-amber-200">
                Status: Admin Təsdiqi Gözlənilir
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                Xtream Codes giriş məlumatlarınız avtomatik yaradıldı və qeyd etdiyiniz əlaqə vasitələrinə göndərildi. Admin ödənişi yoxlayıb təsdiq etdikdən dərhal sonra xəttiniz aktivləşəcək və pleyerlərdə işləyəcək.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-300 tabular-nums shrink-0">
            Gözləmədə · {activeSub.planName}
          </span>
        </div>
      )}

      {activeSub.status === 'active' && (
        <div className="p-5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-emerald-200">
                Status: Aktivdir — Bütün Kanallar Açıqdır
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed">
                Abunəliyiniz admin tərəfindən təsdiqlənib. Aşağıdakı Xtream Codes məlumatlarını pleyerə daxil edə, birbaşa M3U faylını yükləyə və ya veb pleyerdə izləyə bilərsiniz.
              </p>
            </div>
          </div>
          <div className="text-left md:text-right shrink-0 tabular-nums">
            <p className="text-sm font-semibold text-emerald-300">
              {remainingDays} gün qalıb
            </p>
            <p className="text-xs text-slate-400">
              Bitmə tarixi: {formatAzDate(activeSub.expiresAt)}
            </p>
          </div>
        </div>
      )}

      {(activeSub.status === 'rejected' || activeSub.status === 'expired') && (
        <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-semibold text-red-200">
                Status: {activeSub.status === 'rejected' ? 'Ləğv Edilib' : 'Müddəti Bitib'}
              </h2>
              <p className="text-xs text-slate-300">
                {activeSub.adminNote ||
                  'Bu abunəlik hazırda aktiv deyil. Davam etmək üçün yeni paket sifariş edə bilərsiniz.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onBrowsePlans}
            className="px-4 py-2 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors shrink-0"
          >
            Yenidən Aktivləşdir
          </button>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Seçilmiş Paket</p>
          <p className="text-base font-semibold text-white mt-1">{activeSub.planName}</p>
          <p className="text-xs text-slate-400 mt-1 tabular-nums">
            {activeSub.durationDays} gün · {activeSub.priceAzn} AZN
          </p>
        </div>
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Cihaz Limiti</p>
          <p className="text-base font-semibold text-white mt-1 tabular-nums">
            {activeSub.maxConnections} Eyni Anda Bağlantı
          </p>
          <p className="text-xs text-slate-400 mt-1">Smart TV · Mobil · PC</p>
        </div>
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Kanal Həcmi</p>
          <p className="text-base font-semibold text-white mt-1 tabular-nums">
            {channels.length.toLocaleString('az-AZ')} Canlı Kanal
          </p>
          <p className="text-xs text-slate-400 mt-1">AZ · TR · İdman · Kino</p>
        </div>
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Yaradılma Tarixi</p>
          <p className="text-sm font-medium text-white mt-1 tabular-nums">
            {formatAzDate(activeSub.createdAt)}
          </p>
          <p className="text-xs text-slate-400 mt-1">Ödəniş: Təsdiqlənib</p>
        </div>
      </div>

      {/* Main Grid: Xtream Credentials + Setup Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-[#11151E] border border-white/10 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-white">
                Avtomatik Xtream Codes Giriş Məlumatları
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                IPTV Smarters Pro, TiviMate, Televizo və GSE Smart IPTV üçün
              </p>
            </div>
            <div className="flex items-center gap-2">
              {activeSub.status === 'active' && (
                <button
                  type="button"
                  onClick={() => void downloadDirectM3uFile(activeSub.xtreamUsername)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Birbaşa M3U Faylı Yüklə</span>
                </button>
              )}
              <button
                type="button"
                disabled={diagLoading}
                onClick={() => void runDiagnostics(activeSub, publicHost)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#090B10] border border-white/15 rounded-lg text-slate-200 hover:border-amber-400/60 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>{diagLoading ? 'Yoxlanır...' : 'Bağlantını Yoxla'}</span>
              </button>
            </div>
          </div>

          {diagResult && (
            <div
              className={`p-3.5 rounded-lg border text-xs leading-relaxed ${
                diagResult.ok
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'
              }`}
            >
              {diagResult.message}
            </div>
          )}

          <div className="space-y-3">
            {/* Server Host */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-[#090B10] border border-white/10 rounded-lg">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">Server URL (Host)</p>
                <p className="text-sm font-mono text-white truncate mt-0.5">
                  {publicHost}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyValue('host', publicHost)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#11151E] border border-white/10 rounded text-slate-200 hover:border-amber-400/60 transition-colors shrink-0"
              >
                {copiedKey === 'host' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'host' ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </div>

            {/* Username & Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between gap-2 p-3.5 bg-[#090B10] border border-white/10 rounded-lg">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">İstifadəçi Adı (Username)</p>
                  <p className="text-sm font-mono text-amber-300 truncate mt-0.5 tabular-nums">
                    {activeSub.xtreamUsername}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => copyValue('user', activeSub.xtreamUsername)}
                  aria-label="İstifadəçi adını kopyala"
                  className="p-2 bg-[#11151E] border border-white/10 rounded text-slate-300 hover:text-white shrink-0"
                >
                  {copiedKey === 'user' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 p-3.5 bg-[#090B10] border border-white/10 rounded-lg">
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400">Şifrə (Password)</p>
                  <p className="text-sm font-mono text-white truncate mt-0.5">
                    {showPassword ? activeSub.xtreamPassword : '••••••••••'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    aria-label="Şifrəni göstər/gizlət"
                    className="p-2 bg-[#11151E] border border-white/10 rounded text-slate-300 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => copyValue('pass', activeSub.xtreamPassword)}
                    aria-label="Şifrəni kopyala"
                    className="p-2 bg-[#11151E] border border-white/10 rounded text-slate-300 hover:text-white"
                  >
                    {copiedKey === 'pass' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* M3U Plus URL */}
            <div className="flex items-center justify-between gap-3 p-3.5 bg-[#090B10] border border-white/10 rounded-lg">
              <div className="min-w-0">
                <p className="text-[11px] text-slate-400">M3U Plus Playlist Linki</p>
                <p className="text-xs font-mono text-slate-300 truncate mt-0.5">
                  {publicM3uUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => copyValue('m3u', publicM3uUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#11151E] border border-white/10 rounded text-slate-200 hover:border-amber-400/60 transition-colors shrink-0"
              >
                {copiedKey === 'm3u' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedKey === 'm3u' ? 'Kopyalandı' : 'Kopyala'}</span>
              </button>
            </div>
          </div>

          {/* App setup tabs */}
          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setGuideTab('smarters')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  guideTab === 'smarters'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#090B10] text-slate-300 hover:text-white'
                }`}
              >
                IPTV Smarters Pro
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('tivimate')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  guideTab === 'tivimate'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#090B10] text-slate-300 hover:text-white'
                }`}
              >
                TiviMate
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('vlc')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  guideTab === 'vlc'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-[#090B10] text-slate-300 hover:text-white'
                }`}
              >
                VLC / Birbaşa Fayl
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              {guideTab === 'smarters' &&
                'IPTV Smarters Pro-da "Login with Xtream Codes API" seçin → yuxarıdakı Server URL (sondakı / olmadan), İstifadəçi adı və Şifrəni daxil edin. Qeyd: Xarici cihazdan Server URL-ə qoşulmaq üçün tətbiq Share/Publish edilmiş olmalıdır; əks halda "Birbaşa M3U Faylı Yüklə" düyməsi ilə faylı endirib "Load Your Playlist or File/URL" bölməsindən dərhal aça bilərsiniz.'}
              {guideTab === 'tivimate' &&
                'TiviMate-də "Add Playlist" → "Xtream Codes" seçin → Server ünvanını, istifadəçi adını və şifrənizi yazın. Yaxud "Birbaşa M3U Faylı Yüklə" düyməsi ilə faylı endirib "M3U playlist → Select file" ilə dərhal qoşun.'}
              {guideTab === 'vlc' &&
                '"Birbaşa M3U Faylı Yüklə" düyməsini sıxıb .m3u faylını endirin və VLC Media Player (və ya Televizo) ilə açın — bütün 1,185 kanal heç bir əlavə server tələb etmədən dərhal açılacaq.'}
            </p>
          </div>
        </div>

        {/* Right column: Dispatch notifications & Web Player */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-[#11151E] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-white">
                Canlı Web TV Pleyeri
              </h3>
              {activeSub.status !== 'active' && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Təsdiq gözləyir</span>
                </span>
              )}
            </div>

            {activeSub.status === 'active' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {previewChannels.map((ch) => (
                  <button
                    key={ch.streamId}
                    type="button"
                    onClick={() => onWatchChannel(ch, activeSub)}
                    className="flex items-center justify-between gap-2 p-2.5 bg-[#090B10] border border-white/10 rounded-lg hover:border-amber-400/60 text-left transition-colors"
                  >
                    <span className="text-xs font-medium text-white truncate">{ch.name}</span>
                    <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 leading-relaxed">
                Admin təsdiqindən sonra Azərbaycan və beynəlxalq kanalları birbaşa bu bölmədən brauzer daxilində test edə və izləyə bilərsiniz.
              </p>
            )}
          </div>

          <div className="bg-[#11151E] border border-white/10 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2">
              <MailCheck className="w-4 h-4 text-amber-400" />
              <h3 className="font-display text-base font-semibold text-white">
                Göndərilmiş Məlumatlar və Bildirişlər
              </h3>
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-slate-400">Hələ bildiriş yoxdur.</p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-3.5 bg-[#090B10] border border-white/10 rounded-lg space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-white">{n.title}</p>
                      <span className="text-[11px] text-slate-500 tabular-nums shrink-0">
                        {formatAzDate(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Payment History Table */}
      <div className="bg-[#11151E] border border-white/10 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center gap-2">
          <Receipt className="w-4 h-4 text-amber-400" />
          <h2 className="font-display text-base font-semibold text-white">
            Avtomatlaşdırılmış Ödəniş Tarixçəsi
          </h2>
        </div>

        {payments.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            Ödəniş qəbzi tapılmadı.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/10 text-slate-400 bg-[#090B10]/60">
                <tr>
                  <th className="py-3 px-5 font-medium">Tranzaksiya ID</th>
                  <th className="py-3 px-5 font-medium">Paket</th>
                  <th className="py-3 px-5 font-medium">Ödəniş Üsulu</th>
                  <th className="py-3 px-5 font-medium">Hesab / Detal</th>
                  <th className="py-3 px-5 font-medium text-right">Məbləğ</th>
                  <th className="py-3 px-5 font-medium">Status</th>
                  <th className="py-3 px-5 font-medium text-right">Tarix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {payments.map((pay) => (
                  <tr key={pay.id} className="hover:bg-white/[0.02]">
                    <td className="py-3 px-5 font-mono text-amber-300 tabular-nums">
                      {pay.transactionRef}
                    </td>
                    <td className="py-3 px-5 text-white font-medium">{pay.planName}</td>
                    <td className="py-3 px-5 text-slate-300">{pay.methodLabel}</td>
                    <td className="py-3 px-5 font-mono text-slate-400">{pay.maskedDetails}</td>
                    <td className="py-3 px-5 text-right font-mono text-white tabular-nums">
                      {pay.amountAzn} AZN
                    </td>
                    <td className="py-3 px-5 text-emerald-400 font-medium">
                      {pay.status === 'paid' ? 'Ödənilib' : 'Geri qaytarılıb'}
                    </td>
                    <td className="py-3 px-5 text-right text-slate-400 tabular-nums">
                      {formatAzDate(pay.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
