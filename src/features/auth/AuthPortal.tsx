import React, { useEffect, useMemo, useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Globe,
  KeyRound,
  Search,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { auth, googleAuthProvider } from '../../lib/firebase';
import { apiFetch, fileToBase64Attachment, setMemorySessionToken } from '../../shared/api/client';
import { StatusText, formatMoney } from '../../shared/components/StatusText';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import { PWAInstallButton } from '../../shared/pwa/PWAInstall';
import type { SiteConfig } from '../../shared/siteConfig';

interface AuthPortalProps {
  lang: Language;
  siteConfig: SiteConfig | null;
  onToggleLang: () => void;
  onPasswordLoginSuccess: () => Promise<void>;
  externalError?: string | null;
}

export const AuthPortal: React.FC<AuthPortalProps> = ({
  lang,
  siteConfig,
  onToggleLang,
  onPasswordLoginSuccess,
  externalError,
}) => {
  const t = translations[lang];
  const [section, setSection] = useState<'overview' | 'signin' | 'assistance' | 'track'>('overview');
  const [slideIndex, setSlideIndex] = useState(0);
  const [sliderPaused, setSliderPaused] = useState(false);

  // Sign-In state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Forgot Password modal state
  const [showForgot, setShowForgot] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotBusy, setForgotBusy] = useState(false);

  // Public Assistance Request state
  const [pubReqName, setPubReqName] = useState('');
  const [pubReqPhone, setPubReqPhone] = useState('');
  const [benNameEn, setBenNameEn] = useState('');
  const [benNameTa, setBenNameTa] = useState('');
  const [familyNameEn, setFamilyNameEn] = useState('');
  const [streetEn, setStreetEn] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [reqCurrency, setReqCurrency] = useState<'INR' | 'AED'>('INR');
  const [reqType, setReqType] = useState<'normal' | 'emergency'>('normal');
  const [reasonOptions, setReasonOptions] = useState<
    Array<{ id: string; nameEn: string; nameTa: string; status: string }>
  >([]);
  const [reqReasonId, setReqReasonId] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [reqAttachment, setReqAttachment] = useState<{
    fileName: string;
    mimeType: string;
    fileDataBase64: string;
  } | null>(null);
  const [captchaSeed, setCaptchaSeed] = useState(() => ({
    a: Math.floor(Math.random() * 8) + 2,
    b: Math.floor(Math.random() * 8) + 2,
  }));
  const [captchaInput, setCaptchaInput] = useState('');
  const [pubBusy, setPubBusy] = useState(false);
  const [pubError, setPubError] = useState<string | null>(null);
  const [pubReceipt, setPubReceipt] = useState<{
    requestNumber: string;
    trackingToken: string;
    status: string;
  } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Public Status Tracker state
  const [trackNumber, setTrackNumber] = useState('');
  const [trackToken, setTrackToken] = useState('');
  const [trackBusy, setTrackBusy] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackResult, setTrackResult] = useState<{
    requestNumber: string;
    status: string;
    requestType: string;
    currencyCode: string;
    requestedAmount: string;
    createdAt: string;
    paidAt: string | null;
  } | null>(null);

  const displayedAuthError = useMemo(() => authError || externalError, [authError, externalError]);

  const slides = useMemo(() => siteConfig?.sliderPhotos || [], [siteConfig]);
  const highlights = useMemo(() => siteConfig?.highlights || [], [siteConfig]);
  const appTitle =
    lang === 'ta'
      ? siteConfig?.appTitleTa || t.appName
      : siteConfig?.appTitleEn || t.appName;
  const heroBadge =
    lang === 'ta'
      ? siteConfig?.heroBadgeTa || 'தமிழ் & English · INR & AED'
      : siteConfig?.heroBadgeEn || 'English & தமிழ் · INR & AED';
  const heroSubtitle =
    lang === 'ta'
      ? siteConfig?.heroSubtitleTa || t.appSubtitle
      : siteConfig?.heroSubtitleEn || t.appSubtitle;

  useEffect(() => {
    if (slides.length <= 1 || sliderPaused || section !== 'overview') return;
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slides.length);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [slides.length, sliderPaused, section]);

  useEffect(() => {
    if (slideIndex >= slides.length) {
      setSlideIndex(0);
    }
  }, [slides.length, slideIndex]);

  useEffect(() => {
    if (section !== 'assistance') return;
    let active = true;
    apiFetch<{ reasons: Array<{ id: string; nameEn: string; nameTa: string; status: string }> }>(
      '/api/public/assistance-reasons',
      { skipAuth: true }
    )
      .then((res) => {
        if (active) setReasonOptions(res.reasons || []);
      })
      .catch(() => {
        // Keep empty list gracefully if offline
      });
    return () => {
      active = false;
    };
  }, [section]);

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setAuthBusy(true);
    try {
      setMemorySessionToken(null);
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      setAuthError(err?.message || 'Google Sign-In failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleUsernameLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      const data = await apiFetch<{ token: string }>('/api/auth/login', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ username, password }),
      });
      setMemorySessionToken(data.token);
      await onPasswordLoginSuccess();
    } catch (err: any) {
      setAuthError(err?.message || 'Invalid username or password.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotBusy(true);
    setForgotMessage(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/forgot-password', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ identifier: forgotIdentifier }),
      });
      setForgotMessage(res.message);
    } catch (err: any) {
      setForgotMessage(err?.message || 'Unable to process recovery request.');
    } finally {
      setForgotBusy(false);
    }
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setReqAttachment(null);
      return;
    }
    try {
      const encoded = await fileToBase64Attachment(file);
      setReqAttachment(encoded);
      setPubError(null);
    } catch (err: any) {
      setPubError(err.message);
      e.target.value = '';
    }
  };

  const handlePublicAssistanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPubError(null);
    setPubBusy(true);
    try {
      const res = await apiFetch<{
        requestNumber: string;
        trackingToken: string;
        status: string;
      }>('/api/public/assistance', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({
          publicRequesterName: pubReqName,
          publicRequesterPhone: pubReqPhone,
          beneficiaryNameEn: benNameEn,
          beneficiaryNameTa: benNameTa,
          familyNameEn,
          streetEn,
          requestedAmount: Number(reqAmount),
          currencyCode: reqCurrency,
          requestType: reqType,
          reasonId: reqReasonId,
          reason: reqReason,
          attachment: reqAttachment,
          captchaA: captchaSeed.a,
          captchaB: captchaSeed.b,
          captchaAnswer: Number(captchaInput),
        }),
      });
      setPubReceipt(res);
      setTrackNumber(res.requestNumber);
      setTrackToken(res.trackingToken);
      setPubReqName('');
      setPubReqPhone('');
      setBenNameEn('');
      setBenNameTa('');
      setFamilyNameEn('');
      setStreetEn('');
      setReqAmount('');
      setReqReasonId('');
      setReqReason('');
      setReqAttachment(null);
      setCaptchaInput('');
      setCaptchaSeed({
        a: Math.floor(Math.random() * 8) + 2,
        b: Math.floor(Math.random() * 8) + 2,
      });
    } catch (err: any) {
      setPubError(err.message || 'Failed to submit request.');
    } finally {
      setPubBusy(false);
    }
  };

  const handleTrackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrackError(null);
    setTrackResult(null);
    setTrackBusy(true);
    try {
      const res = await apiFetch('/api/public/assistance/track', {
        method: 'POST',
        skipAuth: true,
        body: JSON.stringify({ requestNumber: trackNumber, trackingToken: trackToken }),
      });
      setTrackResult(res);
    } catch (err: any) {
      setTrackError(err.message || 'No matching request found.');
    } finally {
      setTrackBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* 3-Zone Top Bar Contract */}
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6">
          <a
            href="/"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-emerald-900 whitespace-nowrap shrink-0 dark:text-emerald-400"
          >
            {siteConfig?.logoDataUrl && (
              <img
                src={siteConfig.logoDataUrl}
                alt={appTitle}
                className="h-8 w-8 rounded-lg border border-slate-200 object-contain bg-white p-0.5 dark:border-slate-700"
              />
            )}
            <span>{appTitle}</span>
          </a>

          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex dark:text-slate-300">
            <button
              type="button"
              onClick={() => setSection('overview')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 dark:hover:text-white ${
                section === 'overview' ? 'text-emerald-800 underline underline-offset-8 dark:text-emerald-400' : ''
              }`}
            >
              {t.overview}
            </button>
            <button
              type="button"
              onClick={() => setSection('assistance')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 dark:hover:text-white ${
                section === 'assistance' ? 'text-emerald-800 underline underline-offset-8 dark:text-emerald-400' : ''
              }`}
            >
              {t.publicAssistance}
            </button>
            <button
              type="button"
              onClick={() => setSection('track')}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 dark:hover:text-white ${
                section === 'track' ? 'text-emerald-800 underline underline-offset-8 dark:text-emerald-400' : ''
              }`}
            >
              {t.trackRequest}
            </button>
            <button
              type="button"
              onClick={onToggleLang}
              title={t.languageLabel}
              aria-label={t.languageLabel}
              className="inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors hover:text-slate-900 dark:hover:text-white"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{lang === 'en' ? 'த' : 'EN'}</span>
            </button>
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleLang}
              title={t.languageLabel}
              aria-label={t.languageLabel}
              className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 md:hidden dark:border-slate-700 dark:text-slate-200"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{lang === 'en' ? 'த' : 'EN'}</span>
            </button>
            <PWAInstallButton label={t.installApp} />
            <button
              type="button"
              onClick={() => setSection('assistance')}
              className={`hidden min-h-[40px] items-center rounded-lg border px-3.5 py-2 text-xs font-medium transition sm:inline-flex whitespace-nowrap shrink-0 ${
                section === 'assistance'
                  ? 'border-emerald-800 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700'
              }`}
            >
              {t.publicAssistance}
            </button>
            <button
              type="button"
              onClick={() => setSection('signin')}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-900 whitespace-nowrap shrink-0"
            >
              <KeyRound className="h-3.5 w-3.5" />
              <span>{t.signIn}</span>
            </button>
          </div>
        </div>

        {/* Mobile Quick Switcher */}
        <div className="flex border-t border-slate-200 px-4 md:hidden dark:border-slate-800">
          {(['overview', 'assistance', 'track'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setSection(tab)}
              className={`flex-1 py-2.5 text-xs font-medium whitespace-nowrap ${
                section === tab
                  ? 'border-b-2 border-emerald-800 text-emerald-900 dark:border-emerald-400 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {tab === 'overview'
                ? t.overview
                : tab === 'assistance'
                  ? t.publicAssistance
                  : t.trackRequest}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        {section === 'overview' && (
          <div className="mx-auto max-w-5xl space-y-8">
            {displayedAuthError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                {displayedAuthError}
              </div>
            )}

            {/* Editorial Overview */}
            <div>
              {heroBadge && (
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-400">
                  {heroBadge}
                </p>
              )}
              <h1 className="mt-2 max-w-2xl font-display text-3xl font-bold tracking-tight text-slate-900 [text-wrap:balance] sm:text-5xl dark:text-white">
                {appTitle}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300">
                {heroSubtitle}
              </p>
            </div>

            {/* Multi-Photo Slider */}
            {slides.length > 0 && (
              <div
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 dark:border-slate-800"
                onMouseEnter={() => setSliderPaused(true)}
                onMouseLeave={() => setSliderPaused(false)}
              >
                <div className="relative aspect-[16/9] max-h-[420px] w-full">
                  {slides.map((slide, idx) => (
                    <div
                      key={slide.id}
                      className={`absolute inset-0 transition-opacity duration-500 ${
                        idx === slideIndex ? 'opacity-100' : 'pointer-events-none opacity-0'
                      }`}
                    >
                      <img
                        src={slide.imageDataUrl}
                        alt={
                          (lang === 'ta' ? slide.captionTa : slide.captionEn) ||
                          `${appTitle} ${idx + 1}`
                        }
                        className="h-full w-full object-cover"
                      />
                      {(slide.captionEn || slide.captionTa) && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/85 via-slate-950/40 to-transparent px-5 pb-4 pt-12">
                          <p className="text-sm font-medium text-white">
                            {lang === 'ta'
                              ? slide.captionTa || slide.captionEn
                              : slide.captionEn || slide.captionTa}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {slides.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        setSlideIndex((prev) => (prev - 1 + slides.length) % slides.length)
                      }
                      aria-label="Previous slide"
                      className="absolute left-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/55 text-white backdrop-blur-sm transition hover:bg-slate-950/80"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setSlideIndex((prev) => (prev + 1) % slides.length)}
                      aria-label="Next slide"
                      className="absolute right-3 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-slate-950/55 text-white backdrop-blur-sm transition hover:bg-slate-950/80"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <div className="absolute bottom-3.5 right-4 flex items-center gap-1.5">
                      {slides.map((s, idx) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSlideIndex(idx)}
                          aria-label={`Slide ${idx + 1}`}
                          className={`h-2 rounded-full transition-all ${
                            idx === slideIndex ? 'w-5 bg-white' : 'w-2 bg-white/45 hover:bg-white/75'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Highlights Grid */}
            {highlights.length > 0 && (
              <div className="grid grid-cols-1 gap-6 border-t border-slate-200 pt-7 sm:grid-cols-2 dark:border-slate-800">
                {highlights.map((item, idx) => (
                  <div key={item.id}>
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {String(idx + 1).padStart(2, '0')}.{' '}
                      {lang === 'ta' ? item.titleTa || item.titleEn : item.titleEn}
                    </h2>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      {lang === 'ta' ? item.bodyTa || item.bodyEn : item.bodyEn}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'signin' && (
          <div className="mx-auto max-w-md">
            <div className="rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">{t.signIn}</h1>
              </div>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Authorized member accounts only. No public self-registration.
              </p>

              {displayedAuthError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                >
                  {displayedAuthError}
                </div>
              )}

              <div className="mt-6">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleGoogleSignIn}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  <span>{t.loginWithGoogle}</span>
                </button>
              </div>

              <div className="my-6 flex items-center gap-3 text-xs text-slate-400">
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                <span>or</span>
                <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
              </div>

              <form onSubmit={handleUsernameLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.username}
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. kumar_uae"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      {t.password}
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setShowForgot(true);
                        setForgotMessage(null);
                      }}
                      className="text-xs font-medium text-emerald-800 hover:underline dark:text-emerald-400"
                    >
                      {t.forgotPassword}
                    </button>
                  </div>
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authBusy}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-900 disabled:opacity-60"
                >
                  <KeyRound className="h-4 w-4" />
                  <span>{authBusy ? t.loading : t.loginWithUsername}</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {section === 'assistance' && (
          <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {t.publicAssistance}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {t.publicRequestIntro}
            </p>

            {pubReceipt && (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
                <h2 className="text-sm font-semibold text-emerald-950 dark:text-emerald-200">
                  Assistance Request Submitted
                </h2>
                <p className="mt-1 text-xs text-emerald-900 dark:text-emerald-300">
                  {t.trackingNotice}
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-800 dark:bg-slate-900">
                    <div className="text-xs text-slate-500">Request Number</div>
                    <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                      {pubReceipt.requestNumber}
                    </div>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-white p-3 dark:border-emerald-800 dark:bg-slate-900">
                    <div>
                      <div className="text-xs text-slate-500">Private Tracking Token</div>
                      <div className="mt-0.5 font-mono text-sm font-semibold text-slate-900 dark:text-white">
                        {pubReceipt.trackingToken}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(
                          `${pubReceipt.requestNumber} / ${pubReceipt.trackingToken}`
                        );
                        setCopiedToken(true);
                        setTimeout(() => setCopiedToken(false), 2000);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                      title="Copy reference"
                    >
                      {copiedToken ? <Check className="h-4 w-4 text-emerald-700" /> : <Copy className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSection('track')}
                  className="mt-4 text-xs font-semibold text-emerald-900 underline dark:text-emerald-300"
                >
                  Check status in Request Tracker →
                </button>
              </div>
            )}

            {pubError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {pubError}
              </div>
            )}

            <form onSubmit={handlePublicAssistanceSubmit} className="mt-6 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.requesterName} *
                  </label>
                  <input
                    type="text"
                    required
                    value={pubReqName}
                    onChange={(e) => setPubReqName(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.requesterPhone}
                  </label>
                  <input
                    type="text"
                    value={pubReqPhone}
                    onChange={(e) => setPubReqPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.beneficiaryNameEn} *
                  </label>
                  <input
                    type="text"
                    required
                    value={benNameEn}
                    onChange={(e) => setBenNameEn(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.beneficiaryNameTa}
                  </label>
                  <input
                    type="text"
                    value={benNameTa}
                    onChange={(e) => setBenNameTa(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Family Name
                  </label>
                  <input
                    type="text"
                    value={familyNameEn}
                    onChange={(e) => setFamilyNameEn(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.streetLocation}
                  </label>
                  <input
                    type="text"
                    value={streetEn}
                    onChange={(e) => setStreetEn(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.amount} *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    required
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.currency}
                  </label>
                  <select
                    value={reqCurrency}
                    onChange={(e) => setReqCurrency(e.target.value as 'INR' | 'AED')}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                  >
                    <option value="INR">INR (Indian Rupee)</option>
                    <option value="AED">AED (UAE Dirham)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.urgency}
                </label>
                <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setReqType('normal')}
                    className={`rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium transition ${
                      reqType === 'normal'
                        ? 'border-emerald-800 bg-emerald-50 text-emerald-900 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-200'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t.normalRequest}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReqType('emergency')}
                    className={`rounded-lg border px-3.5 py-2.5 text-left text-xs font-medium transition ${
                      reqType === 'emergency'
                        ? 'border-amber-700 bg-amber-50 text-amber-950 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-200'
                        : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {t.emergencyRequest}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.reason} *
                </label>
                <select
                  required
                  value={reqReasonId}
                  onChange={(e) => setReqReasonId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                >
                  <option value="">{t.selectReason}</option>
                  {reasonOptions.map((r) => (
                    <option key={r.id} value={r.id}>
                      {lang === 'ta' ? r.nameTa : r.nameEn}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  {t.reasonDetails}
                </label>
                <textarea
                  rows={3}
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder={lang === 'ta' ? 'தேவைப்பட்டால் கூடுதல் விவரங்களை உள்ளிடவும்...' : 'Optional context or case notes...'}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.attachment}
                  </label>
                  <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <Upload className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {reqAttachment ? reqAttachment.fileName : 'Choose proof document...'}
                    </span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={handleAttachmentChange}
                      className="hidden"
                    />
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t.mathCheck}: What is {captchaSeed.a} + {captchaSeed.b}? *
                  </label>
                  <input
                    type="number"
                    required
                    value={captchaInput}
                    onChange={(e) => setCaptchaInput(e.target.value)}
                    placeholder="Enter sum"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-950"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={pubBusy}
                  className="min-h-[44px] rounded-lg bg-emerald-800 px-6 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-900 disabled:opacity-60"
                >
                  {pubBusy ? t.loading : t.submit}
                </button>
              </div>
            </form>
          </div>
        )}

        {section === 'track' && (
          <div className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
            <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
              {t.trackRequest}
            </h1>
            <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
              {t.trackingNotice}
            </p>

            <form onSubmit={handleTrackSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Request Number
                </label>
                <input
                  type="text"
                  required
                  value={trackNumber}
                  onChange={(e) => setTrackNumber(e.target.value)}
                  placeholder="REQ-202611-XXXXXX"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Private Tracking Token
                </label>
                <input
                  type="text"
                  required
                  value={trackToken}
                  onChange={(e) => setTrackToken(e.target.value)}
                  placeholder="TRK-XXXXXXXXXXXXXXXXXXXXXXXX"
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm uppercase dark:border-slate-700 dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                disabled={trackBusy}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
                <span>{trackBusy ? t.loading : t.trackRequest}</span>
              </button>
            </form>

            {trackError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                {trackError}
              </div>
            )}

            {trackResult && (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">
                    {trackResult.requestNumber}
                  </span>
                  <StatusText status={trackResult.status} lang={lang} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                  <span>Type: {trackResult.requestType}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(trackResult.requestedAmount, trackResult.currencyCode)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Submitted {new Date(trackResult.createdAt).toLocaleDateString()}</span>
                  {trackResult.paidAt && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>Paid {new Date(trackResult.paidAt).toLocaleDateString()}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Forgot Password Modal */}
      {showForgot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Account Recovery
            </h3>
            <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400">
              Enter your assigned username or recovery email. If no email is linked, contact your
              Village Fund Administrator for assisted verification.
            </p>
            <form onSubmit={handleForgotSubmit} className="mt-4 space-y-3">
              <input
                type="text"
                required
                value={forgotIdentifier}
                onChange={(e) => setForgotIdentifier(e.target.value)}
                placeholder="Username or recovery email"
                className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-950"
              />
              {forgotMessage && (
                <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {forgotMessage}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgot(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
                >
                  {t.close}
                </button>
                <button
                  type="submit"
                  disabled={forgotBusy}
                  className="rounded-lg bg-emerald-800 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-900 disabled:opacity-60"
                >
                  {forgotBusy ? t.loading : t.submit}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
