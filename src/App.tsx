import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  FileCheck2,
  Globe,
  HandHeart,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LayoutTemplate,
  LogOut,
  Moon,
  MoreHorizontal,
  ShieldAlert,
  Sun,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { auth } from './lib/firebase';
import {
  apiFetch,
  setFirebaseTokenProvider,
  setMemorySessionToken,
} from './shared/api/client';
import type { Language } from './shared/i18n/translations';
import { translations } from './shared/i18n/translations';
import { OfflineIndicator, PWAInstallButton } from './shared/pwa/PWAInstall';
import type { SiteConfig } from './shared/siteConfig';
import { LandingDesignView } from './features/admin/LandingDesignView';
import { AssistanceView } from './features/assistance/AssistanceView';
import { AuditView } from './features/audit/AuditView';
import { AccountProfileModal, getInitials } from './features/auth/AccountProfileModal';
import { AuthPortal } from './features/auth/AuthPortal';
import { ContributionsView } from './features/contributions/ContributionsView';
import { DashboardView, type UserSession } from './features/dashboard/DashboardView';
import { MembersView } from './features/members/MembersView';
import { TreasuryView } from './features/treasury/TreasuryView';

type TabKey =
  | 'dashboard'
  | 'contributions'
  | 'assistance'
  | 'treasury'
  | 'members'
  | 'audit'
  | 'landing';

export default function App() {
  const [lang, setLang] = useState<Language>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('vwcf_lang') : null;
    return saved === 'ta' ? 'ta' : 'en';
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = typeof window !== 'undefined' ? window.localStorage.getItem('vwcf_theme') : null;
    return saved === 'dark';
  });

  const [user, setUser] = useState<UserSession | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // Account profile & password modal
  const [accountModalTab, setAccountModalTab] = useState<'profile' | 'password' | null>(null);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);

  const t = translations[lang];
  const appTitle =
    lang === 'ta' ? siteConfig?.appTitleTa || t.appName : siteConfig?.appTitleEn || t.appName;

  useEffect(() => {
    window.localStorage.setItem('vwcf_lang', lang);
    document.documentElement.lang = lang === 'ta' ? 'ta' : 'en';
  }, [lang]);

  useEffect(() => {
    document.title = appTitle;
  }, [appTitle]);

  useEffect(() => {
    apiFetch<{ config: SiteConfig | null }>('/api/public/site-config', { skipAuth: true })
      .then((res) => {
        if (res.config) setSiteConfig(res.config);
      })
      .catch(() => {
        // Fallback to static translation defaults when offline
      });
  }, []);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      window.localStorage.setItem('vwcf_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      window.localStorage.setItem('vwcf_theme', 'light');
    }
  }, [darkMode]);

  const fetchCurrentProfile = useCallback(async (applyPreferredLanguage = false) => {
    setAuthError(null);
    try {
      const res = await apiFetch<{ user: UserSession }>('/api/auth/me');
      setUser(res.user);
      if (applyPreferredLanguage) {
        setLang(res.user.preferredLanguage === 'ta' ? 'ta' : 'en');
      }
    } catch (err: any) {
      setUser(null);
      setAuthError(err.message || 'Unable to verify session.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseTokenProvider(() => fbUser.getIdToken());
        await fetchCurrentProfile(true);
      } else {
        setFirebaseTokenProvider(null);
        // Preserve username/password session if active; otherwise user is signed out
        setUser((prev) => prev);
      }
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [fetchCurrentProfile]);

  const handleSignOut = async () => {
    setMemorySessionToken(null);
    setFirebaseTokenProvider(null);
    setUser(null);
    setAuthError(null);
    setActiveTab('dashboard');
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch {
      // Ignore signout errors
    }
  };

  const navItems = useMemo(() => {
    if (!user) return [];
    const roles = user.roles;
    const isAdmin = roles.includes('admin');
    const isCommittee = roles.includes('committee_member');
    const isTreasurer = roles.includes('treasurer');
    const isAuditor = roles.includes('auditor');

    const items: Array<{ key: TabKey; label: string; Icon: React.FC<{ className?: string }> }> = [
      { key: 'dashboard', label: t.dashboard, Icon: LayoutDashboard },
      { key: 'contributions', label: t.contributions, Icon: Wallet },
      { key: 'assistance', label: t.assistance, Icon: HandHeart },
    ];

    if (isAdmin || isCommittee || isTreasurer || isAuditor) {
      items.push({ key: 'treasury', label: t.treasury, Icon: Landmark });
      items.push({ key: 'members', label: t.members, Icon: Users });
    }
    if (isAdmin || isAuditor) {
      items.push({ key: 'audit', label: t.audit, Icon: FileCheck2 });
    }
    if (isAdmin) {
      items.push({ key: 'landing', label: t.landingDesigner, Icon: LayoutTemplate });
    }
    return items;
  }, [user, t]);

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.key === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [navItems, activeTab]);

  useEffect(() => {
    if (!mobileMoreOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMoreOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMoreOpen]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600 dark:bg-slate-950 dark:text-slate-300">
        {t.loading}
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <OfflineIndicator message={t.offlineBanner} />
        <AuthPortal
          lang={lang}
          siteConfig={siteConfig}
          onToggleLang={() => setLang((l) => (l === 'en' ? 'ta' : 'en'))}
          onPasswordLoginSuccess={() => fetchCurrentProfile(true)}
          externalError={authError}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20 text-slate-900 lg:pb-0 dark:bg-slate-950 dark:text-slate-100">
      <OfflineIndicator message={t.offlineBanner} />

      <div className="flex min-h-screen">
        {/* Desktop Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              {siteConfig?.logoDataUrl && (
                <img
                  src={siteConfig.logoDataUrl}
                  alt={appTitle}
                  className="h-7 w-7 shrink-0 rounded-md border border-slate-200 object-contain bg-white p-0.5 dark:border-slate-700"
                />
              )}
              <div className="truncate font-display text-base font-bold tracking-tight text-emerald-900 dark:text-emerald-400">
                {appTitle}
              </div>
            </div>
            <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
              @{user.username} · {user.roles.map((r) => t.roles[r]).join(', ')}
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {navItems.map(({ key, label, Icon }) => {
              const active = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3.5 py-2 text-left text-xs font-medium transition ${
                    active
                      ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="space-y-1.5 border-t border-slate-200 p-3 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAccountModalTab('password')}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              <span>{t.changePassword}</span>
            </button>
            <button
              type="button"
              onClick={handleSignOut}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span>{t.signOut}</span>
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Header */}
          <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                {siteConfig?.logoDataUrl && (
                  <img
                    src={siteConfig.logoDataUrl}
                    alt={appTitle}
                    className="h-6 w-6 shrink-0 rounded-md border border-slate-200 object-contain bg-white p-0.5 lg:hidden dark:border-slate-700"
                  />
                )}
                <span className="font-display text-sm font-bold text-emerald-900 truncate lg:hidden dark:text-emerald-400">
                  {appTitle}
                </span>
                <span className="hidden text-xs font-medium text-slate-500 lg:inline dark:text-slate-400">
                  {appTitle} / {navItems.find((n) => n.key === activeTab)?.label}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <PWAInstallButton label={t.installApp} />
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === 'en' ? 'ta' : 'en'))}
                  title={t.languageLabel}
                  aria-label={t.languageLabel}
                  className="inline-flex h-[38px] items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Globe className="h-3.5 w-3.5 shrink-0" />
                  <span>{lang === 'en' ? 'த' : 'EN'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDarkMode((d) => !d)}
                  aria-label="Toggle color theme"
                  className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setAccountModalTab('profile')}
                  aria-label={t.myAccount}
                  title={t.myAccount}
                  className="inline-flex min-h-[38px] items-center gap-2 rounded-lg border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-left transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/80"
                >
                  {user.avatarUrl ? (
                    <img
                      src={user.avatarUrl}
                      alt={lang === 'ta' && user.fullNameTa ? user.fullNameTa : user.fullNameEn}
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-[11px] font-bold text-white dark:bg-emerald-700">
                      {getInitials(user.fullNameEn || user.username)}
                    </span>
                  )}
                  <span className="hidden max-w-[130px] truncate text-xs font-medium text-slate-700 sm:inline dark:text-slate-200">
                    {lang === 'ta' && user.fullNameTa ? user.fullNameTa : user.fullNameEn}
                  </span>
                </button>
              </div>
            </div>
          </header>

          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">
            {user.roles.length === 0 && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>
                  Your account has no assigned roles yet. Contact an Administrator to assign your
                  member or committee role.
                </span>
              </div>
            )}

            {activeTab === 'dashboard' && (
              <DashboardView
                user={user}
                lang={lang}
                onNavigate={(tab) => setActiveTab(tab as TabKey)}
              />
            )}
            {activeTab === 'contributions' && <ContributionsView user={user} lang={lang} />}
            {activeTab === 'assistance' && <AssistanceView user={user} lang={lang} />}
            {activeTab === 'treasury' && <TreasuryView user={user} lang={lang} />}
            {activeTab === 'members' && <MembersView user={user} lang={lang} />}
            {activeTab === 'audit' && <AuditView lang={lang} />}
            {activeTab === 'landing' && user.roles.includes('admin') && (
              <LandingDesignView
                lang={lang}
                siteConfig={siteConfig}
                onConfigUpdated={(cfg) => setSiteConfig(cfg)}
              />
            )}
          </main>
        </div>
      </div>

      {/* Mobile More Options Bottom Sheet (MS Teams-style overflow drawer) */}
      {mobileMoreOpen && navItems.length > 5 && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-slate-950/50 backdrop-blur-xs lg:hidden"
          onClick={() => setMobileMoreOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={t.moreOptions}
        >
          <div
            className="w-full rounded-t-3xl border-t border-slate-200 bg-white px-4 pb-6 pt-3 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {t.moreOptions}
              </span>
              <button
                type="button"
                onClick={() => setMobileMoreOpen(false)}
                aria-label={t.close}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              {navItems.slice(4).map(({ key, label, Icon }) => {
                const active = activeTab === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveTab(key);
                      setMobileMoreOpen(false);
                    }}
                    className={`flex min-h-[76px] flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center transition ${
                      active
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Bottom Tab Bar (<= 15% viewport height, >= 44px touch targets, no horizontal scroll) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        {(() => {
          const hasOverflow = navItems.length > 5;
          const visibleItems = hasOverflow ? navItems.slice(0, 4) : navItems;
          const overflowItems = hasOverflow ? navItems.slice(4) : [];
          const overflowActive = overflowItems.some((item) => item.key === activeTab);
          const colCount = visibleItems.length + (hasOverflow ? 1 : 0);
          const gridColsClass =
            colCount === 5
              ? 'grid-cols-5'
              : colCount === 4
                ? 'grid-cols-4'
                : colCount === 3
                  ? 'grid-cols-3'
                  : colCount === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1';

          return (
            <div className={`grid h-16 items-center px-1 ${gridColsClass}`}>
              {visibleItems.map(({ key, label, Icon }) => {
                const active = activeTab === key && !mobileMoreOpen;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveTab(key);
                      setMobileMoreOpen(false);
                    }}
                    className={`flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium whitespace-nowrap ${
                      active
                        ? 'text-emerald-800 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="max-w-full truncate">{label}</span>
                  </button>
                );
              })}

              {hasOverflow && (
                <button
                  type="button"
                  onClick={() => setMobileMoreOpen((v) => !v)}
                  aria-expanded={mobileMoreOpen}
                  aria-label={t.moreOptions}
                  className={`flex min-h-[44px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium whitespace-nowrap ${
                    mobileMoreOpen || overflowActive
                      ? 'text-emerald-800 dark:text-emerald-400'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <MoreHorizontal className="h-5 w-5 shrink-0" />
                  <span className="max-w-full truncate">{t.moreOptions}</span>
                </button>
              )}
            </div>
          );
        })()}
      </nav>

      <AccountProfileModal
        isOpen={accountModalTab !== null}
        initialTab={accountModalTab || 'profile'}
        user={user}
        lang={lang}
        onClose={() => setAccountModalTab(null)}
        onLanguageChange={(nextLang) => setLang(nextLang)}
        onProfileUpdated={() => fetchCurrentProfile(false)}
        onSignOut={handleSignOut}
      />
    </div>
  );
}
