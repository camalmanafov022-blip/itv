import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
  User,
} from 'firebase/auth';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { X, CreditCard, Smartphone, Coins, CheckCircle2, Lock, UserPlus, LogIn } from 'lucide-react';
import { auth, db, formatFirebaseAuthError, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  buildM3uUrl,
  generateSafeId,
  generateTransactionRef,
  generateXtreamPassword,
  generateXtreamUsername,
  getPublicXtreamHost,
  syncSubscriptionToServer,
} from '../lib/xtreamUtils';
import { PaymentMethodType, PlanDefinition } from '../types/iptv';

interface CheckoutModalProps {
  plan: PlanDefinition | null;
  user: User | null;
  existingProfileName?: string;
  existingProfilePhone?: string;
  hasUserProfileDoc: boolean;
  onClose: () => void;
  onSuccess: (subId: string) => void;
}

export const CheckoutModal: React.FC<CheckoutModalProps> = ({
  plan,
  user,
  existingProfileName,
  existingProfilePhone,
  hasUserProfileDoc,
  onClose,
  onSuccess,
}) => {
  const [authTab, setAuthTab] = useState<'register' | 'login'>('register');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);

  const [fullName, setFullName] = useState(existingProfileName || user?.displayName || '');
  const [phone, setPhone] = useState(existingProfilePhone || '+994 ');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodType>('card');

  // Automated payment gateway fields
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [m10Phone, setM10Phone] = useState('+994 ');
  const [usdtTxId, setUsdtTxId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (plan) {
      setErrorMsg(null);
      if (existingProfileName || user?.displayName) {
        setFullName(existingProfileName || user?.displayName || '');
      }
      if (existingProfilePhone) {
        setPhone(existingProfilePhone);
      }
    }
  }, [plan, user, existingProfileName, existingProfilePhone]);

  if (!plan) return null;

  const formatCardInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 16);
    return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  const formatExpiryInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) {
      return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    return digits;
  };

  const handleInlineLogin = async () => {
    setErrorMsg(null);
    const cleanEmail = authEmail.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Düzgün e-poçt ünvanı daxil edin.');
      return;
    }
    if (authPassword.length < 6) {
      setErrorMsg('Şifrə minimum 6 simvol olmalıdır.');
      return;
    }

    setLoginBusy(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, cleanEmail, authPassword);
      if (cred.user.displayName && !fullName.trim()) {
        setFullName(cred.user.displayName);
      }
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setLoginBusy(false);
    }
  };

  const validateAndSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!user && authTab === 'login') {
      setErrorMsg('Əvvəlcə yuxarıdakı bölmədən hesabınıza daxil olun və ya "Yeni Hesab Yarat" seçin.');
      return;
    }

    const cleanName = fullName.trim();
    const cleanPhone = phone.trim();
    if (cleanName.length < 2) {
      setErrorMsg('Ad və soyad minimum 2 simvol olmalıdır.');
      return;
    }
    if (cleanPhone.length < 7) {
      setErrorMsg('WhatsApp / əlaqə nömrəsini düzgün daxil edin.');
      return;
    }

    const cleanEmail = authEmail.trim().toLowerCase();
    if (!user) {
      if (!cleanEmail || !cleanEmail.includes('@')) {
        setErrorMsg('Qeydiyyat üçün düzgün e-poçt ünvanı daxil edin.');
        return;
      }
      if (authPassword.length < 6) {
        setErrorMsg('Hesab şifrəsi minimum 6 simvol olmalıdır.');
        return;
      }
    }

    let methodLabel = '';
    let maskedDetails = '';

    if (paymentMethod === 'card') {
      const digits = cardNumber.replace(/\s/g, '');
      if (digits.length < 16) {
        setErrorMsg('16 rəqəmli bank kartı nömrəsini daxil edin.');
        return;
      }
      if (!/^\d{2}\/\d{2}$/.test(cardExpiry)) {
        setErrorMsg('Kartın son istifadə tarixini AA/İİ formatında daxil edin.');
        return;
      }
      if (cardCvv.trim().length < 3) {
        setErrorMsg('3 rəqəmli CVV kodunu daxil edin.');
        return;
      }
      methodLabel = 'Bank Kartı (Visa / Mastercard)';
      maskedDetails = `•••• ${digits.slice(-4)}`;
    } else if (paymentMethod === 'm10') {
      const cleanedM10 = m10Phone.trim();
      if (cleanedM10.length < 8) {
        setErrorMsg('m10 / MilliÖN nömrənizi daxil edin.');
        return;
      }
      methodLabel = 'm10 / MilliÖN Avtomatik Ödəniş';
      maskedDetails = cleanedM10;
    } else {
      const cleanTx = usdtTxId.trim();
      if (cleanTx.length < 8) {
        setErrorMsg('USDT (TRC-20) əməliyyat TXID kodunu daxil edin.');
        return;
      }
      methodLabel = 'USDT (TRC-20) Kripto';
      maskedDetails = `TX:${cleanTx.slice(0, 10)}...`;
    }

    setSubmitting(true);
    try {
      let activeUser = user;
      let isNewAccount = false;

      if (!activeUser) {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, authPassword);
        await updateProfile(cred.user, { displayName: cleanName.slice(0, 120) });
        void sendEmailVerification(cred.user).catch(() => {
          // Non-blocking verification email
        });
        activeUser = cred.user;
        isNewAccount = true;
      }

      const subId = generateSafeId('sub');
      const payId = generateSafeId('pay');
      const notifId = generateSafeId('notif');
      const xtreamUsername = generateXtreamUsername();
      const xtreamPassword = generateXtreamPassword();
      const xtreamHost = getPublicXtreamHost();
      const m3uUrl = buildM3uUrl(xtreamHost, xtreamUsername, xtreamPassword);
      const transactionRef = generateTransactionRef();

      const batch = writeBatch(db);

      // 1. Create or update user profile
      const userRef = doc(db, 'users', activeUser.uid);
      if (hasUserProfileDoc && !isNewAccount) {
        batch.update(userRef, {
          fullName: cleanName.slice(0, 120),
          phone: cleanPhone.slice(0, 32),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.set(userRef, {
          uid: activeUser.uid,
          fullName: cleanName.slice(0, 120),
          email: (activeUser.email || cleanEmail).slice(0, 160),
          phone: cleanPhone.slice(0, 32),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      // 2. Automated payment record
      batch.set(doc(db, 'payments', payId), {
        id: payId,
        userId: activeUser.uid,
        subscriptionId: subId,
        planId: plan.id,
        planName: plan.name,
        amountAzn: plan.priceAzn,
        method: paymentMethod,
        methodLabel,
        transactionRef,
        maskedDetails: maskedDetails.slice(0, 64),
        status: 'paid',
        createdAt: serverTimestamp(),
      });

      // 3. Subscription with automatically generated Xtream Codes (pending admin approval)
      batch.set(doc(db, 'subscriptions', subId), {
        id: subId,
        userId: activeUser.uid,
        userEmail: (activeUser.email || cleanEmail).slice(0, 160),
        userName: cleanName.slice(0, 120),
        userPhone: cleanPhone.slice(0, 32),
        planId: plan.id,
        planName: plan.name,
        billingCycle: plan.billingCycle,
        durationDays: plan.durationDays,
        priceAzn: plan.priceAzn,
        maxConnections: plan.maxConnections,
        status: 'pending',
        xtreamHost,
        xtreamUsername,
        xtreamPassword,
        m3uUrl,
        paymentId: payId,
        paymentMethod,
        paymentStatus: 'paid',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      // 4. Automated Xtream Codes dispatch notification
      batch.set(doc(db, 'notifications', notifId), {
        id: notifId,
        userId: activeUser.uid,
        subscriptionId: subId,
        channel: 'auto_dispatch',
        title: `Xtream Codes məlumatları yaradıldı (${xtreamUsername})`,
        message: `${plan.name} paketi üçün ödəniş (${plan.priceAzn} AZN · ${transactionRef}) təsdiqləndi. Avtomatik Xtream giriş məlumatlarınız ${activeUser.email || cleanEmail} və ${cleanPhone} ünvanına göndərildi. Admin təsdiqindən dərhal sonra kanallar aktivləşəcək.`,
        xtreamUsername,
        createdAt: serverTimestamp(),
      });

      try {
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `subscriptions/${subId}`);
      }

      await syncSubscriptionToServer({
        id: subId,
        userId: activeUser.uid,
        userEmail: activeUser.email || cleanEmail,
        userName: cleanName,
        planId: plan.id,
        planName: plan.name,
        durationDays: plan.durationDays,
        maxConnections: plan.maxConnections,
        status: 'pending',
        xtreamUsername,
        xtreamPassword,
      });

      onSuccess(subId);
    } catch (err) {
      setErrorMsg(formatFirebaseAuthError(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
    >
      <div className="w-full max-w-xl bg-[#11151E] border border-white/15 rounded-xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <p className="text-xs text-amber-400 font-medium">
              {plan.billingCycle === 'weekly' ? 'Həftəlik Paket · 7 Gün' : 'Aylıq Paket · 30 Gün'}
            </p>
            <h3 id="checkout-title" className="font-display text-lg font-semibold text-white">
              {plan.name} — {plan.priceAzn} AZN
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Bağla"
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={validateAndSubmit} className="p-6 space-y-5">
          {/* Standard Registration or Login Step */}
          {!user ? (
            <div className="p-4 bg-[#090B10] border border-white/10 rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#11151E] border border-white/10 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                    authTab === 'register'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Yeni Hesab Yarat</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setErrorMsg(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-colors ${
                    authTab === 'login'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Mövcud Hesaba Daxil Ol</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">E-poçt ünvanı</label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="numune@mail.com"
                    className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">
                    {authTab === 'register' ? 'Hesab Şifrəsi (min. 6 simvol)' : 'Şifrə'}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {authTab === 'login' && (
                <button
                  type="button"
                  disabled={loginBusy}
                  onClick={handleInlineLogin}
                  className="w-full py-2 px-4 bg-white text-slate-950 font-semibold text-xs rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  {loginBusy ? 'Yoxlanılır...' : 'Hesaba Daxil Ol və Davam Et'}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 bg-[#090B10] border border-emerald-500/30 rounded-lg text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Hesab aktivdir: {user.email}</span>
              </div>
              <span className="text-slate-400 tabular-nums">{plan.maxConnections} cihaz</span>
            </div>
          )}

          {/* Customer fields */}
          {(user || authTab === 'register') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Ad və Soyad
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Məs: Kamran Əliyev"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  WhatsApp / Telefon (Məlumat göndərişi)
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+994 50 000 00 00"
                  className="w-full px-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400 font-mono tabular-nums"
                />
              </div>
            </div>
          )}

          {/* Automated Payment Method Tabs */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-2">
              Avtomatlaşdırılmış Ödəniş Üsulu
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'card'
                    ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                    : 'bg-[#090B10] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>Bank Kartı</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('m10')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'm10'
                    ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                    : 'bg-[#090B10] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <Smartphone className="w-4 h-4 shrink-0" />
                <span>m10 / MilliÖN</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('usdt')}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-medium rounded-lg border transition-colors ${
                  paymentMethod === 'usdt'
                    ? 'bg-amber-500/15 border-amber-400 text-amber-300'
                    : 'bg-[#090B10] border-white/10 text-slate-300 hover:border-white/25'
                }`}
              >
                <Coins className="w-4 h-4 shrink-0" />
                <span>USDT TRC-20</span>
              </button>
            </div>
          </div>

          {/* Method-specific payment inputs */}
          {paymentMethod === 'card' && (
            <div className="p-4 bg-[#090B10] border border-white/10 rounded-lg space-y-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Kart Nömrəsi</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(formatCardInput(e.target.value))}
                  placeholder="4169 7388 0000 0000"
                  className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white font-mono tabular-nums focus:outline-none focus:border-amber-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Bitmə Tarixi</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={cardExpiry}
                    onChange={(e) => setCardExpiry(formatExpiryInput(e.target.value))}
                    placeholder="12/28"
                    className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white font-mono tabular-nums focus:outline-none focus:border-amber-400"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">CVV / CVC</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={cardCvv}
                    onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, ''))}
                    placeholder="•••"
                    className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white font-mono tabular-nums focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>
          )}

          {paymentMethod === 'm10' && (
            <div className="p-4 bg-[#090B10] border border-white/10 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>m10 Hesab ID:</span>
                <span className="font-mono text-amber-400 tabular-nums">994 55 820 44 10</span>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Ödəniş edən m10 / telefon nömrəniz
                </label>
                <input
                  type="tel"
                  value={m10Phone}
                  onChange={(e) => setM10Phone(e.target.value)}
                  placeholder="+994 55 000 00 00"
                  className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white font-mono tabular-nums focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {paymentMethod === 'usdt' && (
            <div className="p-4 bg-[#090B10] border border-white/10 rounded-lg space-y-2.5">
              <div className="text-xs text-slate-300 space-y-1">
                <span className="text-slate-400 block">TRC-20 Cüzdan Ünvanı:</span>
                <code className="block p-2 bg-[#11151E] rounded text-amber-400 font-mono text-[11px] break-all">
                  TXazarStream8k9LpQ2vR7nM4wJ6yH3sF5dA1
                </code>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Əməliyyat Hash / TXID
                </label>
                <input
                  type="text"
                  value={usdtTxId}
                  onChange={(e) => setUsdtTxId(e.target.value)}
                  placeholder="TRON TXID daxil edin..."
                  className="w-full px-3.5 py-2 text-sm bg-[#11151E] border border-white/10 rounded-lg text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 leading-relaxed">
              {errorMsg}
            </div>
          )}

          <div className="pt-2 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Ödənişdən dərhal sonra Xtream Codes yaradılır</span>
            </div>
            <button
              type="submit"
              disabled={submitting || (!user && authTab === 'login')}
              className="px-5 py-2.5 text-sm font-semibold bg-amber-500 text-slate-950 rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {submitting
                ? 'Emal edilir...'
                : `${plan.priceAzn} AZN Ödə və Hesabı Yarat`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
