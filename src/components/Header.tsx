import React from 'react';
import { User } from 'firebase/auth';

export type ActiveView = 'home' | 'dashboard' | 'admin';

interface HeaderProps {
  activeView: ActiveView;
  onNavigate: (view: ActiveView, anchorId?: string) => void;
  user: User | null;
  isAdmin: boolean;
  onSignIn: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeView,
  onNavigate,
  user,
  isAdmin,
  onSignIn,
  onSignOut,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-[#090B10]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single clean wordmark */}
        <button
          type="button"
          onClick={() => onNavigate('home')}
          className="font-display text-lg font-bold tracking-tight text-white hover:text-amber-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-amber-400"
        >
          XəzərStream
        </button>

        {/* Zone 2: 4 concise single-line navigation links */}
        <nav
          aria-label="Əsas naviqasiya"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300"
        >
          <button
            type="button"
            onClick={() => onNavigate('home', 'paketler')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
              activeView === 'home'
                ? 'border-transparent hover:border-amber-400/70'
                : 'border-transparent hover:border-amber-400/70'
            }`}
          >
            Paketlər
          </button>
          <button
            type="button"
            onClick={() => onNavigate('home', 'kanallar')}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b border-transparent hover:border-amber-400/70"
          >
            Kanallar
          </button>
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
              activeView === 'dashboard'
                ? 'text-amber-400 border-amber-400'
                : 'border-transparent hover:border-amber-400/70'
            }`}
          >
            İstifadəçi Paneli
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 pb-0.5 border-b ${
                activeView === 'admin'
                  ? 'text-amber-400 border-amber-400'
                  : 'border-transparent hover:border-amber-400/70'
              }`}
            >
              Admin Paneli
            </button>
          )}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              className="px-4 py-2 text-xs font-semibold text-slate-200 bg-[#161B26] border border-white/10 rounded-lg hover:border-amber-400/60 hover:text-white transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Çıxış ({user.displayName?.split(' ')[0] || 'Hesab'})
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              className="px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 rounded-lg hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400"
            >
              Hesaba Daxil Ol
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
