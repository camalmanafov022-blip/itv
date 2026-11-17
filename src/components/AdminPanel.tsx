import React, { useMemo, useState } from 'react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  Search,
  ShieldCheck,
  Terminal,
  XCircle,
  CalendarPlus,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { formatAzDate, generateSafeId, syncSubscriptionToServer } from '../lib/xtreamUtils';
import { PaymentRecord, SubscriptionRecord, SubscriptionStatus } from '../types/iptv';

interface AdminPanelProps {
  subscriptions: SubscriptionRecord[];
  payments: PaymentRecord[];
  loading: boolean;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({
  subscriptions,
  payments,
  loading,
}) => {
  const [filterStatus, setFilterStatus] = useState<'ALL' | SubscriptionStatus>('ALL');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [apiTestResult, setApiTestResult] = useState<string | null>(null);

  const stats = useMemo(() => {
    const pendingCount = subscriptions.filter((s) => s.status === 'pending').length;
    const activeCount = subscriptions.filter((s) => s.status === 'active').length;
    const totalRevenue = payments
      .filter((p) => p.status === 'paid')
      .reduce((acc, item) => acc + Number(item.amountAzn || 0), 0);
    return {
      pendingCount,
      activeCount,
      totalRevenue,
      totalOrders: subscriptions.length,
    };
  }, [subscriptions, payments]);

  const filteredSubs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return subscriptions.filter((s) => {
      if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
      if (q) {
        return (
          s.userName.toLowerCase().includes(q) ||
          s.userEmail.toLowerCase().includes(q) ||
          s.userPhone.toLowerCase().includes(q) ||
          s.xtreamUsername.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [subscriptions, filterStatus, search]);

  const handleApproveAndActivate = async (sub: SubscriptionRecord) => {
    setBusyId(sub.id);
    try {
      const now = new Date();
      const expires = new Date(now.getTime() + sub.durationDays * 24 * 60 * 60 * 1000);
      const activatedAt = now.toISOString();
      const expiresAt = expires.toISOString();
      const notifId = generateSafeId('notif');

      const batch = writeBatch(db);
      batch.update(doc(db, 'subscriptions', sub.id), {
        status: 'active',
        activatedAt,
        expiresAt,
        adminNote: 'Admin tərəfindən təsdiqləndi və aktivləşdirildi.',
        updatedAt: serverTimestamp(),
      });

      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: sub.userId,
        subscriptionId: sub.id,
        channel: 'admin_approval',
        title: `Abunəliyiniz aktivləşdirildi (${sub.xtreamUsername})`,
        message: `${sub.planName} paketiniz admin tərəfindən təsdiqləndi. Xtream Codes girişiniz ${formatAzDate(expiresAt)} tarixinədək aktivdir.`,
        xtreamUsername: sub.xtreamUsername,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${sub.id}`);
      }

      await syncSubscriptionToServer({
        ...sub,
        status: 'active',
        activatedAt,
        expiresAt,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleExtendDays = async (sub: SubscriptionRecord, extraDays: number) => {
    setBusyId(sub.id);
    try {
      const baseMs = sub.expiresAt
        ? Math.max(Date.now(), new Date(sub.expiresAt).getTime())
        : Date.now();
      const expiresAt = new Date(baseMs + extraDays * 24 * 60 * 60 * 1000).toISOString();
      const activatedAt = sub.activatedAt || new Date().toISOString();

      const batch = writeBatch(db);
      batch.update(doc(db, 'subscriptions', sub.id), {
        status: 'active',
        activatedAt,
        expiresAt,
        adminNote: `Müddət +${extraDays} gün uzadıldı.`,
        updatedAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${sub.id}`);
      }

      await syncSubscriptionToServer({
        ...sub,
        status: 'active',
        activatedAt,
        expiresAt,
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleRejectOrDisable = async (sub: SubscriptionRecord) => {
    setBusyId(sub.id);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'subscriptions', sub.id), {
        status: 'rejected',
        adminNote: 'Admin tərəfindən deaktiv edildi.',
        updatedAt: serverTimestamp(),
      });

      const notifId = generateSafeId('notif');
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: sub.userId,
        subscriptionId: sub.id,
        channel: 'admin_approval',
        title: `Abunəlik dayandırıldı (${sub.xtreamUsername})`,
        message: 'Abunəliyiniz admin tərəfindən deaktiv edildi. Ətraflı məlumat üçün dəstək ilə əlaqə saxlayın.',
        xtreamUsername: sub.xtreamUsername,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `subscriptions/${sub.id}`);
      }

      await syncSubscriptionToServer({
        ...sub,
        status: 'rejected',
      });
    } finally {
      setBusyId(null);
    }
  };

  const testXtreamEndpoint = async (sub: SubscriptionRecord) => {
    setApiTestResult('Yoxlanılır...');
    try {
      const res = await fetch(
        `/player_api.php?username=${encodeURIComponent(sub.xtreamUsername)}&password=${encodeURIComponent(sub.xtreamPassword)}`
      );
      const data = await res.json();
      setApiTestResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setApiTestResult(err instanceof Error ? err.message : 'Test xətası');
    }
  };

  return (
    <section className="py-10 px-6 max-w-[1200px] mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Admin İdarəetmə Konsolu</span>
          </div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-white mt-1">
            Abunəlik Təsdiqləri və Xtream Aktivasiyası
          </h1>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Gözləyən Təsdiqlər</p>
          <p className="text-2xl font-display font-semibold text-amber-400 mt-1 tabular-nums">
            {stats.pendingCount}
          </p>
        </div>
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Aktiv İstifadəçilər</p>
          <p className="text-2xl font-display font-semibold text-emerald-400 mt-1 tabular-nums">
            {stats.activeCount}
          </p>
        </div>
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Ümumi Sifarişlər</p>
          <p className="text-2xl font-display font-semibold text-white mt-1 tabular-nums">
            {stats.totalOrders}
          </p>
        </div>
        <div className="p-4 bg-[#11151E] border border-white/10 rounded-xl">
          <p className="text-xs text-slate-400">Təsdiqlənmiş Gəlir</p>
          <p className="text-2xl font-display font-semibold text-white mt-1 tabular-nums">
            {stats.totalRevenue.toFixed(2)} AZN
          </p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              ['ALL', 'Hamısı'],
              ['pending', 'Təsdiq Gözləyən'],
              ['active', 'Aktiv'],
              ['rejected', 'Deaktiv / Ləğv'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(key)}
              className={`px-3.5 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                filterStatus === key
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-[#11151E] border border-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ad, e-poçt, telefon və ya Xtream ID..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-[#11151E] border border-white/10 rounded-lg text-white placeholder:text-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>
      </div>

      {/* Subscriptions Queue */}
      <div className="bg-[#11151E] border border-white/10 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Məlumatlar yüklənir...</div>
        ) : filteredSubs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-400">
            Seçilmiş filtr üzrə abunəlik tapılmadı.
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {filteredSubs.map((sub) => {
              const payment = payments.find((p) => p.id === sub.paymentId);
              const isBusy = busyId === sub.id;

              return (
                <div
                  key={sub.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-5 hover:bg-white/[0.015]"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-sm font-semibold text-white">{sub.userName}</span>
                      <span className="text-slate-500" aria-hidden="true">·</span>
                      <span className="text-slate-300">{sub.userEmail}</span>
                      <span className="text-slate-500" aria-hidden="true">·</span>
                      <span className="font-mono text-slate-400 tabular-nums">{sub.userPhone}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 tabular-nums">
                      <span className="text-amber-300 font-medium">{sub.planName}</span>
                      <span aria-hidden="true">·</span>
                      <span>{sub.priceAzn} AZN ({sub.durationDays} gün)</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono text-slate-300">
                        Xtream: {sub.xtreamUsername}
                      </span>
                      {payment && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            Ödəniş: {payment.methodLabel} ({payment.transactionRef})
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                      {sub.status === 'pending' && (
                        <span className="inline-flex items-center gap-1.5 text-amber-400 font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Admin təsdiqi gözləyir</span>
                        </span>
                      )}
                      {sub.status === 'active' && (
                        <span className="inline-flex items-center gap-1.5 text-emerald-400 font-medium tabular-nums">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Aktivdir · Bitir: {formatAzDate(sub.expiresAt)}</span>
                        </span>
                      )}
                      {(sub.status === 'rejected' || sub.status === 'expired') && (
                        <span className="inline-flex items-center gap-1.5 text-red-400 font-medium">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{sub.status === 'rejected' ? 'Deaktiv edilib' : 'Bitib'}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Admin Controls */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {sub.status !== 'active' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleApproveAndActivate(sub)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-emerald-500 text-slate-950 rounded-lg hover:bg-emerald-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Təsdiqlə və Aktivləşdir</span>
                      </button>
                    )}

                    {sub.status === 'active' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleExtendDays(sub, sub.durationDays)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#090B10] border border-white/15 text-slate-200 rounded-lg hover:border-amber-400/60 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <CalendarPlus className="w-3.5 h-3.5 text-amber-400" />
                        <span>+{sub.durationDays} Gün Uzat</span>
                      </button>
                    )}

                    {sub.status !== 'rejected' && (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleRejectOrDisable(sub)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#090B10] border border-red-500/30 text-red-300 rounded-lg hover:bg-red-500/10 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Deaktiv Et</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => testXtreamEndpoint(sub)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#090B10] border border-white/10 text-slate-300 rounded-lg hover:border-white/30 transition-colors whitespace-nowrap shrink-0"
                    >
                      <Terminal className="w-3.5 h-3.5 text-amber-400" />
                      <span>API Yoxla</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Live Xtream API Response Inspector */}
      {apiTestResult && (
        <div className="bg-[#11151E] border border-white/10 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-amber-400">
              Xtream Codes `/player_api.php` Canlı Cavabı
            </h3>
            <button
              type="button"
              onClick={() => setApiTestResult(null)}
              className="text-xs text-slate-400 hover:text-white"
            >
              Bağla
            </button>
          </div>
          <pre className="p-4 bg-[#090B10] border border-white/10 rounded-lg text-xs font-mono text-slate-200 overflow-x-auto max-h-64">
            {apiTestResult}
          </pre>
        </div>
      )}
    </section>
  );
};
