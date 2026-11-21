import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import {
  FileCheck2,
  Globe,
  HandHeart,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LogOut,
  Moon,
  ShieldAlert,
  Sun,
  Users,
  Wallet,
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
import { AssistanceView } from './features/assistance/AssistanceView';
import { AuditView } from './features/audit/AuditView';
import { AuthPortal } from './features/auth/AuthPortal';
import { ContributionsView } from './features/contributions/ContributionsView';
import { DashboardView, type UserSession } from './features/dashboard/DashboardView';
import { MembersView } from './features/members/MembersView';
import { TreasuryView } from './features/treasury/TreasuryView';

type TabKey = 'dashboard' | 'contributions' | 'assistance' | 'treasury' | 'members' | 'audit';

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
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('dashboard');

  // Password change modal
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [newPwd, setNewPwd] = useState('');
  const [pwdMsg, setPwdMsg] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const t = translations[lang];

  useEffect(() => {
    window.localStorage.setItem('vwcf_lang', lang);
    document.documentElement.lang = lang === 'ta' ? 'ta' : 'en';
  }, [lang]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      window.localStorage.setItem('vwcf_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      window.localStorage.setItem('vwcf_theme', 'light');
    }
  }, [darkMode]);

  const fetchCurrentProfile = useCallback(async () => {
    setAuthError(null);
    try {
      const res = await apiFetch<{ user: UserSession }>('/api/auth/me');
      setUser(res.user);
    } catch (err: any) {
      setUser(null);
      setAuthError(err.message || 'Unable to verify session.');
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseTokenProvider(() => fbUser.getIdToken());
        await fetchCurrentProfile();
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
    return items;
  }, [user, t]);

  useEffect(() => {
    if (navItems.length > 0 && !navItems.some((n) => n.key === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [navItems, activeTab]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdBusy(true);
    setPwdMsg(null);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: newPwd }),
      });
      setNewPwd('');
      setPwdMsg('Password updated successfully.');
    } catch (err: any) {
      setPwdMsg(err.message || 'Failed to update password.');
    } finally {
      setPwdBusy(false);
    }
  };

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
          onToggleLang={() => setLang((l) => (l === 'en' ? 'ta' : 'en'))}
          onPasswordLoginSuccess={fetchCurrentProfile}
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
            <div className="font-display text-base font-bold tracking-tight text-emerald-900 dark:text-emerald-400">
              {t.appName}
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
              onClick={() => {
                setShowChangePassword(true);
                setPwdMsg(null);
              }}
              className="flex min-h-[40px] w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              <span>Change Password</span>
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
              <div className="flex min-w-0 items-center gap-3">
                <span className="font-display text-sm font-bold text-emerald-900 truncate lg:hidden dark:text-emerald-400">
                  {t.appName}
                </span>
                <span className="hidden text-xs font-medium text-slate-500 lg:inline dark:text-slate-400">
                  {t.appName} / {navItems.find((n) => n.key === activeTab)?.label}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <PWAInstallButton label={t.installApp} />
                <button
                  type="button"
                  onClick={() => setLang((l) => (l === 'en' ? 'ta' : 'en'))}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <Globe className="h-3.5 w-3.5" />
                  <span>{t.languageLabel}</span>
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
                  onClick={handleSignOut}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 lg:hidden dark:border-slate-700 dark:bg-slate-800 dark:text-red-400"
                >
                  <LogOut className="h-3.5 w-3.5" />
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
          </main>
        </div>
      </div>

      {/* Mobile Bottom Tab Bar (<= 15% viewport height, >= 44px touch targets) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
      >
        <div className="flex h-16 items-center justify-around px-1">
          {navItems.slice(0, 5).map(({ key, label, Icon }) => {
            const active = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex min-h-[44px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium ${
                  active
                    ? 'text-emerald-800 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="max-w-[68px] truncate">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form
            onSubmit={handlePasswordChange}
            className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
          >
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Set / Update Login Password
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Username: <span className="font-mono">@{user.username}</span>
            </p>
            <input
              type="password"
              required
              minLength={8}
              value={newPwd}
              onChange={(e) => setNewPwd(e.target.value)}
              placeholder="New password (min 8 chars)"
              className="mt-4 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            {pwdMsg && <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">{pwdMsg}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowChangePassword(false)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200"
              >
                {t.close}
              </button>
              <button
                type="submit"
                disabled={pwdBusy}
                className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900"
              >
                {pwdBusy ? t.loading : t.save}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
