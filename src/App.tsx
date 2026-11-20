import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, sendEmailVerification, signOut, User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Check, ArrowRight, Tv, ShieldCheck, Zap, CreditCard } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import { syncBatchToServer, syncSubscriptionToServer } from './lib/xtreamUtils';
import { fetchChannelsWithFallback } from './lib/m3uClient';
import heroCinemaImg from './assets/images/hero_iptv_cinema_1794949153123.jpg';
import sportsStadiumImg from './assets/images/sports_live_stadium_1794949152098.jpg';
import cinemaLoungeImg from './assets/images/cinema_4k_lounge_1794949152320.jpg';
import {
  ADMIN_EMAIL,
  BillingCycle,
  CategoryItem,
  ChannelItem,
  DispatchNotification,
  PaymentRecord,
  PlanDefinition,
  PLANS,
  SubscriptionRecord,
} from './types/iptv';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ActiveView, Header } from './components/Header';
import { ChannelDirectory } from './components/ChannelDirectory';
import { CheckoutModal } from './components/CheckoutModal';
import { UserDashboard } from './components/UserDashboard';
import { AdminPanel } from './components/AdminPanel';
import { WebPlayerModal } from './components/WebPlayerModal';
import { AuthModal, AuthModalMode } from './components/AuthModal';

function sortByCreatedDesc<T extends { createdAt?: unknown }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const getMs = (val: unknown) => {
      if (!val) return 0;
      if (typeof val === 'string') return new Date(val).getTime();
      if (
        typeof val === 'object' &&
        val !== null &&
        'toMillis' in val &&
        typeof (val as { toMillis: () => number }).toMillis === 'function'
      ) {
        return (val as { toMillis: () => number }).toMillis();
      }
      return 0;
    };
    return getMs(b.createdAt) - getMs(a.createdAt);
  });
}

function resolveViewFromLocation(): ActiveView {
  if (typeof window === 'undefined') return 'home';
  const hash = window.location.hash.toLowerCase();
  const path = window.location.pathname.toLowerCase();
  if (hash === '#admin' || path === '/admin' || path.endsWith('/admin')) {
    return 'admin';
  }
  if (hash === '#panel' || hash === '#dashboard') {
    return 'dashboard';
  }
  return 'home';
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>(() => resolveViewFromLocation());

  // Channels from azer.m3u
  const [channels, setChannels] = useState<ChannelItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(true);
  const [channelsError, setChannelsError] = useState<string | null>(null);

  // Pricing cadence filter
  const [cycleFilter, setCycleFilter] = useState<'all' | BillingCycle>('all');
  const [checkoutPlan, setCheckoutPlan] = useState<PlanDefinition | null>(null);

  // Auth modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<AuthModalMode>('login');
  const [, setAuthRefreshTick] = useState(0);

  // User data from Firestore
  const [hasUserProfileDoc, setHasUserProfileDoc] = useState(false);
  const [profileFullName, setProfileFullName] = useState<string | undefined>(undefined);
  const [userPhone, setUserPhone] = useState<string | undefined>(undefined);
  const [userSubs, setUserSubs] = useState<SubscriptionRecord[]>([]);
  const [userPayments, setUserPayments] = useState<PaymentRecord[]>([]);
  const [userNotifications, setUserNotifications] = useState<DispatchNotification[]>([]);
  const [userLoading, setUserLoading] = useState(false);

  // Admin data from Firestore
  const [adminSubs, setAdminSubs] = useState<SubscriptionRecord[]>([]);
  const [adminPayments, setAdminPayments] = useState<PaymentRecord[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);

  // Live web player modal
  const [playingChannel, setPlayingChannel] = useState<{
    channel: ChannelItem;
    sub: SubscriptionRecord;
  } | null>(null);

  const isAdmin = Boolean(user && user.email === ADMIN_EMAIL && user.emailVerified);

  const fetchChannels = useCallback(async (_force = false) => {
    setChannelsLoading(true);
    setChannelsError(null);
    try {
      const data = await fetchChannelsWithFallback();
      setChannels(data.channels || []);
      setCategories(data.categories || []);
    } catch (err) {
      setChannelsError(
        err instanceof Error ? err.message : 'Kanallar yüklənərkən xəta baş verdi.'
      );
    } finally {
      setChannelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchChannels();
  }, [fetchChannels]);

  useEffect(() => {
    const onHashChange = () => {
      setActiveView(resolveViewFromLocation());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Attach user Firestore listeners when signed in
  useEffect(() => {
    if (!authReady || !user) {
      setHasUserProfileDoc(false);
      setProfileFullName(undefined);
      setUserPhone(undefined);
      setUserSubs([]);
      setUserPayments([]);
      setUserNotifications([]);
      return;
    }

    setUserLoading(true);

    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        if (snap.exists()) {
          setHasUserProfileDoc(true);
          const data = snap.data() as { fullName?: string; phone?: string };
          setProfileFullName(data.fullName);
          setUserPhone(data.phone);
        } else {
          setHasUserProfileDoc(false);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${user.uid}`)
    );

    const unsubSubs = onSnapshot(
      query(collection(db, 'subscriptions'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as SubscriptionRecord);
        const sorted = sortByCreatedDesc(list);
        setUserSubs(sorted);
        setUserLoading(false);
        for (const sub of sorted) {
          void syncSubscriptionToServer(sub);
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'subscriptions')
    );

    const unsubPayments = onSnapshot(
      query(collection(db, 'payments'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as PaymentRecord);
        setUserPayments(sortByCreatedDesc(list));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), where('userId', '==', user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => d.data() as DispatchNotification);
        setUserNotifications(sortByCreatedDesc(list));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    return () => {
      unsubProfile();
      unsubSubs();
      unsubPayments();
      unsubNotifs();
    };
  }, [authReady, user]);

  // Attach admin Firestore listeners when signed in as Admin
  useEffect(() => {
    if (!authReady || !isAdmin) {
      setAdminSubs([]);
      setAdminPayments([]);
      return;
    }

    setAdminLoading(true);
    const unsubAdminSubs = onSnapshot(
      collection(db, 'subscriptions'),
      (snap) => {
        const list = sortByCreatedDesc(
          snap.docs.map((d) => d.data() as SubscriptionRecord)
        );
        setAdminSubs(list);
        setAdminLoading(false);
        void syncBatchToServer(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'subscriptions')
    );

    const unsubAdminPays = onSnapshot(
      collection(db, 'payments'),
      (snap) => {
        const list = sortByCreatedDesc(snap.docs.map((d) => d.data() as PaymentRecord));
        setAdminPayments(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'payments')
    );

    return () => {
      unsubAdminSubs();
      unsubAdminPays();
    };
  }, [authReady, isAdmin]);

  const handleOpenAuth = (mode: AuthModalMode = 'login') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleReloadUser = async () => {
    if (auth.currentUser) {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      setUser(auth.currentUser);
      setAuthRefreshTick((t) => t + 1);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setActiveView('home');
    if (window.location.hash === '#admin' || window.location.hash === '#panel') {
      window.history.replaceState(null, '', '#');
    }
  };

  const handleNavigate = (view: ActiveView, anchorId?: string) => {
    setActiveView(view);
    if (view === 'admin') {
      window.history.replaceState(null, '', '#admin');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (view === 'dashboard') {
      window.history.replaceState(null, '', '#panel');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (view === 'home' && anchorId) {
      window.history.replaceState(null, '', `#${anchorId}`);
      setTimeout(() => {
        document.getElementById(anchorId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.history.replaceState(null, '', '#');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const visiblePlans = useMemo(() => {
    if (cycleFilter === 'all') return PLANS;
    return PLANS.filter((p) => p.billingCycle === cycleFilter);
  }, [cycleFilter]);

  const activeUserSub = useMemo(() => {
    return userSubs.find((s) => s.status === 'active') || null;
  }, [userSubs]);

  const subscriptionState: 'active' | 'pending' | 'none' = activeUserSub
    ? 'active'
    : userSubs.some((s) => s.status === 'pending')
      ? 'pending'
      : 'none';

  return (
    <div className="min-h-screen flex flex-col bg-[#090B10] text-slate-100">
      <Header
        activeView={activeView}
        onNavigate={handleNavigate}
        user={user}
        profileFullName={profileFullName}
        isAdmin={isAdmin}
        onOpenAuth={() => handleOpenAuth('login')}
        onSignOut={() => void handleSignOut()}
      />

      {/* Compact mobile navigation strip */}
      <div className="md:hidden border-b border-white/10 bg-[#0D1017] px-4 py-2 flex items-center gap-4 overflow-x-auto text-xs font-medium text-slate-300">
        <button
          type="button"
          onClick={() => handleNavigate('home', 'paketler')}
          className="whitespace-nowrap shrink-0 hover:text-white"
        >
          Paketlər
        </button>
        <button
          type="button"
          onClick={() => handleNavigate('home', 'kanallar')}
          className="whitespace-nowrap shrink-0 hover:text-white"
        >
          Kanallar
        </button>
        <button
          type="button"
          onClick={() => handleNavigate('dashboard')}
          className={`whitespace-nowrap shrink-0 ${
            activeView === 'dashboard' ? 'text-amber-400' : 'hover:text-white'
          }`}
        >
          İstifadəçi Paneli
        </button>
        {isAdmin && (
          <button
            type="button"
            onClick={() => handleNavigate('admin')}
            className={`whitespace-nowrap shrink-0 ${
              activeView === 'admin' ? 'text-amber-400' : 'hover:text-white'
            }`}
          >
            Admin Paneli
          </button>
        )}
      </div>

      <main className="flex-1">
        {activeView === 'dashboard' && (
          <UserDashboard
            user={user}
            subscriptions={userSubs}
            payments={userPayments}
            notifications={userNotifications}
            channels={channels}
            loading={userLoading}
            onOpenAuth={(mode = 'login') => handleOpenAuth(mode)}
            onReloadUser={handleReloadUser}
            onBrowsePlans={() => handleNavigate('home', 'paketler')}
            onWatchChannel={(channel, sub) => setPlayingChannel({ channel, sub })}
          />
        )}

        {activeView === 'admin' && isAdmin && (
          <AdminPanel
            subscriptions={adminSubs}
            payments={adminPayments}
            loading={adminLoading}
          />
        )}

        {activeView === 'admin' && !isAdmin && (
          <section className="py-20 px-6 max-w-[1200px] mx-auto">
            <div className="max-w-lg mx-auto bg-[#11151E] border border-white/10 rounded-xl p-8 text-center space-y-5">
              <ShieldCheck className="w-9 h-9 text-amber-400 mx-auto" />
              <h1 className="font-display text-2xl font-semibold text-white">
                Admin Panelinə Giriş
              </h1>

              {!user ? (
                <>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Admin konsoluna daxil olmaq üçün administrator hesabınızla (
                    <span className="text-white font-mono text-xs">{ADMIN_EMAIL}</span>) giriş edin.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenAuth('login')}
                    className="px-6 py-2.5 text-sm font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors"
                  >
                    Admin Kimi Daxil Ol
                  </button>
                </>
              ) : user.email === ADMIN_EMAIL && !user.emailVerified ? (
                <>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    <span className="text-white font-mono text-xs">{user.email}</span> hesabı ilə daxil olmusunuz. Admin icazəsini aktivləşdirmək üçün e-poçtunuzu bir dəfə təsdiqləyin.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        void sendEmailVerification(user).catch(() => {});
                      }}
                      className="px-5 py-2.5 text-xs font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors"
                    >
                      Təsdiq Linki Göndər
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleReloadUser()}
                      className="px-5 py-2.5 text-xs font-medium bg-[#090B10] border border-white/15 text-white rounded-lg hover:border-amber-400 transition-colors"
                    >
                      Təsdiqlədim, Yenilə
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Hazırda <span className="text-white">{user.email}</span> hesabı aktivdir. Admin paneli yalnız{' '}
                    <span className="text-amber-300 font-mono text-xs">{ADMIN_EMAIL}</span> hesabı üçündür.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleNavigate('home')}
                    className="px-6 py-2.5 text-sm font-semibold bg-[#090B10] border border-white/15 text-white rounded-lg hover:border-amber-400 transition-colors"
                  >
                    Ana Səhifəyə Qayıt
                  </button>
                </>
              )}
            </div>
          </section>
        )}

        {activeView === 'home' && (
          <>
            {/* Hero Section */}
            <section className="pt-12 pb-16 px-6 max-w-[1200px] mx-auto">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
                <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                  <p className="text-xs font-medium tracking-wide text-amber-400">
                    4K IPTV · Avtomatik Xtream Codes · Azərbaycan & Dünya Efiri
                  </p>
                  <h1 className="font-display text-4xl sm:text-5xl lg:text-[54px] font-bold tracking-tight text-white leading-[1.08] text-balance">
                    Azərbaycan və dünya kanalları tək hesabda, dərhal telefon və TV-də
                  </h1>
                  <p className="text-base text-slate-300 leading-relaxed max-w-xl">
                    Həftəlik və ya aylıq paketi seçin, onlayn ödəniş edin və avtomatik yaradılan Xtream Codes giriş məlumatlarınızı dərhal əldə edin. Admin təsdiqindən sonra bütün{' '}
                    <span className="text-white font-medium tabular-nums">
                      {channels.length > 0 ? channels.length.toLocaleString('az-AZ') : '1,200+'}
                    </span>{' '}
                    kanal birbaşa pleyerinizdə açılır.
                  </p>

                  <div className="flex flex-wrap items-center gap-4 pt-2">
                    <a
                      href="#paketler"
                      className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Paketləri Seç</span>
                      <ArrowRight className="w-4 h-4" />
                    </a>
                    <a
                      href="#kanallar"
                      className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-slate-200 bg-[#11151E] border border-white/15 rounded-lg hover:border-white/30 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>Kanallara Bax</span>
                    </a>
                  </div>
                </div>

                <div className="lg:col-span-6">
                  <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-xl overflow-hidden border border-white/10 bg-[#11151E]">
                    <img
                      src={heroCinemaImg}
                      alt="Müasir ev kinoteatrında canlı 4K futbol yayımı"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#090B10]/90 via-[#090B10]/20 to-transparent" />
                    <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
                      <div>
                        <p className="text-xs text-amber-400 font-medium">
                          Smart TV · Android Box · iOS & PC
                        </p>
                        <p className="text-sm font-medium text-white mt-0.5">
                          IPTV Smarters Pro, TiviMate və VLC ilə tam uyğun Xtream API
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4-Column Proof Strip */}
              <div className="mt-12 grid grid-cols-2 lg:grid-cols-4 border border-white/10 rounded-xl bg-[#11151E] divide-y lg:divide-y-0 lg:divide-x divide-white/10">
                <div className="p-5">
                  <p className="font-display text-2xl font-semibold text-white tabular-nums">
                    {channels.length > 0 ? channels.length.toLocaleString('az-AZ') : '1,213'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Canlı TV və Radio Kanalı</p>
                </div>
                <div className="p-5">
                  <p className="font-display text-2xl font-semibold text-white tabular-nums">
                    7 & 30 Gün
                  </p>
                  <p className="text-xs text-slate-400 mt-1">Həftəlik və Aylıq Paketlər</p>
                </div>
                <div className="p-5">
                  <p className="font-display text-2xl font-semibold text-white">Avtomatik</p>
                  <p className="text-xs text-slate-400 mt-1">Xtream Codes + M3U Yaradılması</p>
                </div>
                <div className="p-5">
                  <p className="font-display text-2xl font-semibold text-white">3 Üsul</p>
                  <p className="text-xs text-slate-400 mt-1">Kart, m10/MilliÖN və USDT</p>
                </div>
              </div>
            </section>

            {/* Section 01: Weekly & Monthly Packages */}
            <section id="paketler" className="py-20 border-t border-white/10">
              <div className="max-w-[1200px] mx-auto px-6">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                  <div className="max-w-2xl">
                    <p className="text-xs font-medium tracking-wide text-amber-400 mb-2">
                      01. Abunəlik Paketləri
                    </p>
                    <h2 className="font-display text-3xl md:text-4xl font-semibold tracking-tight text-white text-balance">
                      Həftəlik və aylıq tariflərdən sizə uyğun olanı seçin
                    </h2>
                    <p className="mt-3 text-sm md:text-base text-slate-400 leading-relaxed">
                      Bütün paketlərə Azərbaycan kanalları, beIN Sports Gold, kino, serial və uşaq kanalları daxildir. Qeydiyyat tamamlandıqda Xtream Codes dərhal hesabınıza göndərilir.
                    </p>
                  </div>

                  {/* Interactive Cycle Filter */}
                  <div className="inline-flex items-center gap-1 p-1 bg-[#11151E] border border-white/10 rounded-lg self-start shrink-0">
                    <button
                      type="button"
                      onClick={() => setCycleFilter('all')}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        cycleFilter === 'all'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Bütün Paketlər
                    </button>
                    <button
                      type="button"
                      onClick={() => setCycleFilter('weekly')}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        cycleFilter === 'weekly'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Həftəlik (7 Gün)
                    </button>
                    <button
                      type="button"
                      onClick={() => setCycleFilter('monthly')}
                      className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                        cycleFilter === 'monthly'
                          ? 'bg-amber-500 text-slate-950'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      Aylıq (30 Gün)
                    </button>
                  </div>
                </div>

                <div
                  className={`grid grid-cols-1 md:grid-cols-2 ${
                    visiblePlans.length > 2 ? 'lg:grid-cols-4' : 'lg:grid-cols-2 max-w-4xl'
                  } gap-5`}
                >
                  {visiblePlans.map((plan) => (
                    <div
                      key={plan.id}
                      className={`flex flex-col justify-between p-6 rounded-xl border transition-colors ${
                        plan.featured
                          ? 'bg-[#161B26] border-amber-400/60'
                          : 'bg-[#11151E] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-400">
                            {plan.billingCycle === 'weekly' ? 'Həftəlik' : 'Aylıq'}
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="tabular-nums">{plan.durationDays} gün</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="tabular-nums">{plan.maxConnections} cihaz</span>
                          </p>
                          <h3 className="font-display text-xl font-semibold text-white">
                            {plan.name}
                          </h3>
                          <p className="text-xs text-slate-400 leading-relaxed">
                            {plan.audience}
                          </p>
                        </div>

                        <div className="pt-2 pb-4 border-b border-white/10 flex items-baseline gap-1.5">
                          <span className="font-display text-3xl font-bold text-white tabular-nums">
                            {plan.priceAzn} AZN
                          </span>
                          <span className="text-xs text-slate-400">
                            / {plan.durationDays} gün
                          </span>
                        </div>

                        <ul className="space-y-2.5 text-xs text-slate-300">
                          {plan.highlights.map((item) => (
                            <li key={item} className="flex items-start gap-2">
                              <Check className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                              <span className="leading-relaxed">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCheckoutPlan(plan)}
                        className={`mt-7 w-full py-2.5 px-4 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                          plan.featured
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                            : 'bg-[#090B10] text-white border border-white/15 hover:border-amber-400 hover:text-amber-300'
                        }`}
                      >
                        Paketi Seç və Başla
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* Asymmetric Mechanism & Content Showcase */}
            <section className="py-20 border-t border-white/10">
              <div className="max-w-[1200px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                {/* Left: 3-step automated workflow */}
                <div className="lg:col-span-5 flex flex-col justify-between bg-[#11151E] border border-white/10 rounded-xl p-7 space-y-6">
                  <div>
                    <p className="text-xs font-medium text-amber-400 mb-2">
                      Avtomatlaşdırılmış Sistem
                    </p>
                    <h2 className="font-display text-2xl font-semibold text-white text-balance">
                      Qeydiyyatdan yayımın açılmasına qədər 3 sadə mərhələ
                    </h2>
                  </div>

                  <div className="space-y-5">
                    <div className="flex items-start gap-3.5">
                      <CreditCard className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          01. Paket Seçimi və Avtomatik Ödəniş
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Bank kartı, m10 / MilliÖN və ya USDT ilə ödənişinizi tamamlayıb hesabınızı yaradın.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5">
                      <Zap className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          02. Avtomatik Xtream Codes Göndərişi
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Server URL, istifadəçi adı, şifrə və M3U linki avtomatik generasiya olunub panelinizə və əlaqə vasitənizə göndərilir.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3.5">
                      <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <h3 className="text-sm font-semibold text-white">
                          03. Admin Təsdiqi və Tam Aktivasiya
                        </h3>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          Admin sifarişi təsdiqlədikdən dərhal sonra Xtream xətti aktivləşir və bütün kanallar açılır.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Two domain visual cards */}
                <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="flex flex-col bg-[#11151E] border border-white/10 rounded-xl overflow-hidden">
                    <div className="aspect-[4/3] bg-[#090B10] overflow-hidden">
                      <img
                        src={sportsStadiumImg}
                        alt="Canlı idman və futbol kanalları"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-5 space-y-1.5">
                      <p className="text-xs text-amber-400 font-medium">
                        İdman & Canlı Matçlar
                      </p>
                      <h3 className="font-display text-lg font-semibold text-white">
                        beIN Sports Gold, CBC Sport və Exxen
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Çempionlar Liqası, Premyer Liqa, Türkiyə Super Liqası və Formula 1 yarışları 50/60 FPS axıcılıqda.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col bg-[#11151E] border border-white/10 rounded-xl overflow-hidden">
                    <div className="aspect-[4/3] bg-[#090B10] overflow-hidden">
                      <img
                        src={cinemaLoungeImg}
                        alt="4K film və serial kanalları"
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-5 space-y-1.5">
                      <p className="text-xs text-amber-400 font-medium">
                        Azərbaycan, Kino & Sənədli
                      </p>
                      <h3 className="font-display text-lg font-semibold text-white">
                        Xəzər TV, AzTV, 4K Filmlər və Seriallar
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Yerli televiziya kanalları, uşaq proqramları, sənədli filmlər və fasiləsiz 24/7 kino yayımı.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 02: Full Channel Directory from azer.m3u */}
            <ChannelDirectory
              channels={channels}
              categories={categories}
              loading={channelsLoading}
              error={channelsError}
              onRefresh={() => void fetchChannels(true)}
              subscriptionState={subscriptionState}
              onGoToDashboard={() => handleNavigate('dashboard')}
              onBrowsePlans={() => handleNavigate('home', 'paketler')}
              onSelectChannelToWatch={(channel) => {
                if (activeUserSub) {
                  setPlayingChannel({ channel, sub: activeUserSub });
                }
              }}
            />
          </>
        )}
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-white/10 py-10 px-6">
        <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-slate-400">
          <div className="flex items-center gap-2.5">
            <Tv className="w-4 h-4 text-amber-400" />
            <span className="font-display text-sm font-semibold text-white">XəzərStream</span>
            <span aria-hidden="true">·</span>
            <span>© 2026 Bütün hüquqlar qorunur</span>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <button
              type="button"
              onClick={() => handleNavigate('home', 'paketler')}
              className="hover:text-white transition-colors"
            >
              Paketlər
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('home', 'kanallar')}
              className="hover:text-white transition-colors"
            >
              Kanal Siyahısı
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('dashboard')}
              className="hover:text-white transition-colors"
            >
              İstifadəçi Paneli
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => handleNavigate('admin')}
                className="hover:text-white transition-colors"
              >
                Admin Paneli
              </button>
            )}
          </div>
        </div>
      </footer>

      {/* Registration + Automated Payment Modal */}
      <CheckoutModal
        plan={checkoutPlan}
        user={user}
        existingProfileName={profileFullName}
        existingProfilePhone={userPhone}
        hasUserProfileDoc={hasUserProfileDoc}
        onClose={() => setCheckoutPlan(null)}
        onSuccess={() => {
          setCheckoutPlan(null);
          setActiveView('dashboard');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Standard Email/Password Auth Modal */}
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
      />

      {/* Active Subscriber Web Player */}
      <WebPlayerModal
        channel={playingChannel?.channel || null}
        channels={channels}
        categories={categories}
        username={playingChannel?.sub.xtreamUsername || ''}
        password={playingChannel?.sub.xtreamPassword || ''}
        onSelectChannel={(nextChannel) => {
          if (playingChannel) {
            setPlayingChannel({ channel: nextChannel, sub: playingChannel.sub });
          }
        }}
        onClose={() => setPlayingChannel(null)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
