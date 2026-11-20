import React, { useEffect, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Lock, Mail, Phone, User as UserIcon, X, CheckCircle2 } from 'lucide-react';
import {
  auth,
  db,
  formatFirebaseAuthError,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';

export type AuthModalMode = 'login' | 'register' | 'reset';

interface AuthModalProps {
  open: boolean;
  initialMode?: AuthModalMode;
  onClose: () => void;
  onSuccess?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  open,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<AuthModalMode>(initialMode);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+994 ');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setErrorMsg(null);
      setInfoMsg(null);
    }
  }, [open, initialMode]);

  if (!open) return null;

  const switchMode = (nextMode: AuthModalMode) => {
    setMode(nextMode);
    setErrorMsg(null);
    setInfoMsg(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setErrorMsg('Düzgün e-poçt ünvanı daxil edin.');
      return;
    }

    if (mode === 'reset') {
      setSubmitting(true);
      try {
        await sendPasswordResetEmail(auth, cleanEmail);
        setInfoMsg(
          'Şifrə sıfırlama linki e-poçt ünvanınıza göndərildi. Gələnlər qutusunu (və Spam qovluğunu) yoxlayın.'
        );
      } catch (err) {
        setErrorMsg(formatFirebaseAuthError(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Şifrə minimum 6 simvol olmalıdır.');
      return;
    }

    if (mode === 'register') {
      const cleanName = fullName.trim();
      const cleanPhone = phone.trim();
      if (cleanName.length < 2) {
        setErrorMsg('Ad və soyad minimum 2 simvol olmalıdır.');
        return;
      }
      if (cleanPhone.length < 6) {
        setErrorMsg('Əlaqə / WhatsApp nömrəsini düzgün daxil edin.');
        return;
      }
      if (password !== confirmPassword) {
        setErrorMsg('Şifrələr uyğun gəlmir.');
        return;
      }

      setSubmitting(true);
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, { displayName: cleanName.slice(0, 120) });

        try {
          await setDoc(doc(db, 'users', cred.user.uid), {
            uid: cred.user.uid,
            fullName: cleanName.slice(0, 120),
            email: cleanEmail.slice(0, 160),
            phone: cleanPhone.slice(0, 32),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (fsErr) {
          handleFirestoreError(fsErr, OperationType.CREATE, `users/${cred.user.uid}`);
        }

        void sendEmailVerification(cred.user).catch(() => {
          // Non-blocking verification dispatch
        });

        onSuccess?.();
        onClose();
      } catch (err) {
        setErrorMsg(formatFirebaseAuthError(err));
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Login mode
    setSubmitting(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
      onSuccess?.();
      onClose();
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
      aria-labelledby="auth-modal-title"
    >
      <div className="w-full max-w-md bg-[#11151E] border border-white/15 rounded-xl overflow-hidden my-8">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <p className="text-xs text-amber-400 font-medium">XəzərStream Hesabı</p>
            <h2 id="auth-modal-title" className="font-display text-lg font-semibold text-white">
              {mode === 'login'
                ? 'Hesaba Daxil Ol'
                : mode === 'register'
                  ? 'Yeni Hesab Yarat'
                  : 'Şifrəni Sıfırla'}
            </h2>
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

        {/* Mode Tabs */}
        {mode !== 'reset' && (
          <div className="grid grid-cols-2 gap-1 p-2 bg-[#090B10] border-b border-white/10">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'login'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Daxil Ol
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`py-2 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'register'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Qeydiyyat
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Ad və Soyad
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Məs: Kamran Əliyev"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  WhatsApp / Telefon
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+994 50 000 00 00"
                    className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white font-mono tabular-nums placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              E-poçt ünvanı
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="numune@mail.com"
                className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {mode !== 'reset' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-300">Şifrə</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('reset')}
                    className="text-xs text-amber-400 hover:text-amber-300"
                  >
                    Şifrəni unutdum
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 6 simvol"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Şifrə Təkrarı
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Şifrəni təkrar daxil edin"
                  className="w-full pl-10 pr-3.5 py-2.5 text-sm bg-[#090B10] border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300 leading-relaxed">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 flex items-start gap-2 leading-relaxed">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 px-4 bg-amber-500 text-slate-950 font-semibold text-sm rounded-lg hover:bg-amber-400 transition-colors disabled:opacity-50"
          >
            {submitting
              ? 'Gözləyin...'
              : mode === 'login'
                ? 'Daxil Ol'
                : mode === 'register'
                  ? 'Qeydiyyatı Tamamla'
                  : 'Sıfırlama Linki Göndər'}
          </button>

          {mode === 'reset' && (
            <button
              type="button"
              onClick={() => switchMode('login')}
              className="w-full py-2 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Giriş səhifəsinə qayıt
            </button>
          )}
        </form>
      </div>
    </div>
  );
};
