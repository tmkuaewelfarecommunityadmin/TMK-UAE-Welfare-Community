import React, { useEffect, useRef, useState } from 'react';
import { Camera, CheckCircle2, KeyRound, LogOut, Save, Trash2, User, X } from 'lucide-react';
import { apiFetch } from '../../shared/api/client';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import { resizeImageToDataUrl } from '../../shared/siteConfig';
import type { UserSession } from '../dashboard/DashboardView';

interface MeResponse {
  user: UserSession;
  member: {
    id: string;
    memberNumber: string;
    fullNameEn: string;
    fullNameTa: string | null;
    phoneNumber: string | null;
    email: string | null;
    streetEn: string | null;
    streetTa: string | null;
    locationEn: string | null;
    locationTa: string | null;
    status: string;
  } | null;
  account: {
    username: string;
    recoveryEmail: string | null;
    hasPassword: boolean;
    hasGoogleLink: boolean;
    avatarUrl: string | null;
    preferredLanguage?: 'en' | 'ta';
  } | null;
}

export function getInitials(name: string): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const AccountProfileModal: React.FC<{
  isOpen: boolean;
  initialTab: 'profile' | 'password';
  user: UserSession;
  lang: Language;
  onClose: () => void;
  onLanguageChange: (lang: Language) => void;
  onProfileUpdated: () => Promise<void>;
  onSignOut: () => void;
}> = ({
  isOpen,
  initialTab,
  user,
  lang,
  onClose,
  onLanguageChange,
  onProfileUpdated,
  onSignOut,
}) => {
  const t = translations[lang];
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<'profile' | 'password'>(initialTab);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Profile fields
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(user.avatarUrl || null);
  const [preferredLanguage, setPreferredLanguage] = useState<Language>(
    user.preferredLanguage === 'ta' ? 'ta' : 'en'
  );
  const [memberNumber, setMemberNumber] = useState<string | null>(null);
  const [hasGoogleLink, setHasGoogleLink] = useState(false);
  const [hasMemberRecord, setHasMemberRecord] = useState(Boolean(user.memberId));
  const [fullNameEn, setFullNameEn] = useState(user.fullNameEn);
  const [fullNameTa, setFullNameTa] = useState(user.fullNameTa || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState(user.email || '');
  const [streetEn, setStreetEn] = useState('');
  const [streetTa, setStreetTa] = useState('');
  const [locationEn, setLocationEn] = useState('');
  const [locationTa, setLocationTa] = useState('');

  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);

  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab(initialTab);
    setProfileError(null);
    setProfileSuccess(null);
    setPwdError(null);
    setPwdSuccess(null);
    setNewPassword('');
    setConfirmPassword('');

    let active = true;
    setLoadingDetails(true);
    apiFetch<MeResponse>('/api/auth/me')
      .then((res) => {
        if (!active) return;
        const pref: Language =
          res.account?.preferredLanguage === 'ta' || res.user.preferredLanguage === 'ta'
            ? 'ta'
            : 'en';
        setPreferredLanguage(pref);
        setAvatarDataUrl(res.account?.avatarUrl ?? res.user.avatarUrl ?? null);
        setMemberNumber(res.member?.memberNumber ?? null);
        setHasGoogleLink(Boolean(res.account?.hasGoogleLink));
        setHasMemberRecord(Boolean(res.member));
        setFullNameEn(res.member?.fullNameEn ?? res.user.fullNameEn ?? '');
        setFullNameTa(res.member?.fullNameTa ?? res.user.fullNameTa ?? '');
        setPhoneNumber(res.member?.phoneNumber ?? '');
        setRecoveryEmail(res.account?.recoveryEmail ?? res.member?.email ?? res.user.email ?? '');
        setStreetEn(res.member?.streetEn ?? '');
        setStreetTa(res.member?.streetTa ?? '');
        setLocationEn(res.member?.locationEn ?? '');
        setLocationTa(res.member?.locationTa ?? '');
      })
      .catch((err: any) => {
        if (!active) return;
        setProfileError(err.message || 'Failed to load profile.');
      })
      .finally(() => {
        if (active) setLoadingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setProfileError(null);
    setProfileSuccess(null);
    try {
      const processed = await resizeImageToDataUrl(file, {
        maxDim: 320,
        maxBytes: 1 * 1024 * 1024,
      });
      setAvatarDataUrl(processed);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to process image.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileBusy(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      await apiFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          avatarDataUrl,
          preferredLanguage,
          recoveryEmail: recoveryEmail.trim() || null,
          ...(hasMemberRecord
            ? {
                fullNameEn: fullNameEn.trim(),
                fullNameTa: fullNameTa.trim() || null,
                phoneNumber: phoneNumber.trim() || null,
                streetEn: streetEn.trim() || null,
                streetTa: streetTa.trim() || null,
                locationEn: locationEn.trim() || null,
                locationTa: locationTa.trim() || null,
              }
            : {}),
        }),
      });
      onLanguageChange(preferredLanguage);
      await onProfileUpdated();
      setProfileSuccess(t.profileUpdated);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to update profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPassword.length < 8) {
      setPwdError(t.passwordMinChars);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError(t.passwordsDoNotMatch);
      return;
    }

    setPwdBusy(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });
      setNewPassword('');
      setConfirmPassword('');
      setPwdSuccess(t.passwordUpdated);
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password.');
    } finally {
      setPwdBusy(false);
    }
  };

  const displayName = lang === 'ta' && fullNameTa ? fullNameTa : fullNameEn || user.fullNameEn;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="min-w-0">
            <h2 id="account-modal-title" className="text-base font-semibold text-slate-900 dark:text-white">
              {t.myAccount}
            </h2>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              {memberNumber ? `${memberNumber} · ` : ''}
              {user.roles.map((r) => t.roles[r]).join(', ')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.close}
            title={t.close}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setTab('profile')}
            className={`inline-flex min-h-[40px] items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              tab === 'profile'
                ? 'border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <User className="h-3.5 w-3.5" />
            <span>{t.profileDetails}</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('password')}
            className={`inline-flex min-h-[40px] items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-semibold transition ${
              tab === 'password'
                ? 'border-emerald-700 text-emerald-800 dark:border-emerald-400 dark:text-emerald-300'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="h-3.5 w-3.5" />
            <span>{t.changePassword}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'profile' ? (
            <form id="profile-details-form" onSubmit={handleSaveProfile} className="space-y-4">
              {/* Avatar Block */}
              <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-300 bg-emerald-800 text-white dark:border-slate-700 dark:bg-emerald-900">
                  {avatarDataUrl ? (
                    <img
                      src={avatarDataUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-bold tracking-tight">
                      {getInitials(fullNameEn || user.username)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {displayName}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    {t.photoHint}
                    {hasGoogleLink ? ` · ${t.googleLinked}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handlePhotoSelect}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title={t.uploadPhoto}
                    aria-label={t.uploadPhoto}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  {avatarDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarDataUrl(null);
                        setProfileSuccess(null);
                      }}
                      title={t.removePhoto}
                      aria-label={t.removePhoto}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {loadingDetails && (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.loading}</p>
              )}

              {/* User Details Grid */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.username}
                  </label>
                  <input
                    type="text"
                    value={user.username}
                    disabled
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.preferredLanguage}
                  </label>
                  <select
                    value={preferredLanguage}
                    onChange={(e) => setPreferredLanguage(e.target.value === 'ta' ? 'ta' : 'en')}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    <option value="en">English (Default)</option>
                    <option value="ta">தமிழ் (Tamil)</option>
                  </select>
                </div>

                {hasMemberRecord && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.fullNameEn}
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={120}
                        value={fullNameEn}
                        onChange={(e) => setFullNameEn(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.fullNameTa}
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={fullNameTa}
                        onChange={(e) => setFullNameTa(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.phoneNumber}
                      </label>
                      <input
                        type="tel"
                        maxLength={40}
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </>
                )}

                <div className={hasMemberRecord ? '' : 'sm:col-span-2'}>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.recoveryEmail}
                  </label>
                  <input
                    type="email"
                    maxLength={160}
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                </div>

                {hasMemberRecord && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.streetEn}
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={streetEn}
                        onChange={(e) => setStreetEn(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.streetTa}
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={streetTa}
                        onChange={(e) => setStreetTa(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.locationEn}
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={locationEn}
                        onChange={(e) => setLocationEn(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                        {t.locationTa}
                      </label>
                      <input
                        type="text"
                        maxLength={120}
                        value={locationTa}
                        onChange={(e) => setLocationTa(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                      />
                    </div>
                  </>
                )}
              </div>

              {profileError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {profileError}
                </div>
              )}
              {profileSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{profileSuccess}</span>
                </div>
              )}
            </form>
          ) : (
            <form id="change-password-form" onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.username}
                </label>
                <input
                  type="text"
                  value={user.username}
                  disabled
                  readOnly
                  className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 font-mono text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.newPassword}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t.passwordMinChars}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.confirmPassword}
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={t.passwordMinChars}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-emerald-700 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
              </div>

              {pwdError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{pwdSuccess}</span>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 dark:border-slate-800 dark:bg-slate-950/50">
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            title={t.signOut}
            aria-label={t.signOut}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{t.signOut}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              title={t.close}
              aria-label={t.close}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t.close}</span>
            </button>
            {tab === 'profile' ? (
              <button
                type="submit"
                form="profile-details-form"
                disabled={profileBusy}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{profileBusy ? t.loading : t.save}</span>
              </button>
            ) : (
              <button
                type="submit"
                form="change-password-form"
                disabled={pwdBusy}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{pwdBusy ? t.loading : t.save}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
