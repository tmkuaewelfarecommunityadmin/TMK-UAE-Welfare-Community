import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ImagePlus,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../../shared/api/client';
import type { Language } from '../../shared/i18n/translations';
import { translations } from '../../shared/i18n/translations';
import {
  resizeImageToDataUrl,
  type LandingHighlight,
  type LandingSlidePhoto,
  type SiteConfig,
} from '../../shared/siteConfig';

export const LandingDesignView: React.FC<{
  lang: Language;
  siteConfig: SiteConfig | null;
  onConfigUpdated: (config: SiteConfig) => void;
}> = ({ lang, siteConfig, onConfigUpdated }) => {
  const t = translations[lang];
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const slidesInputRef = useRef<HTMLInputElement | null>(null);

  const [appTitleEn, setAppTitleEn] = useState(siteConfig?.appTitleEn || 'Village Welfare Fund');
  const [appTitleTa, setAppTitleTa] = useState(siteConfig?.appTitleTa || 'கிராம நல நிதி');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(siteConfig?.logoDataUrl || null);
  const [heroBadgeEn, setHeroBadgeEn] = useState(siteConfig?.heroBadgeEn || '');
  const [heroBadgeTa, setHeroBadgeTa] = useState(siteConfig?.heroBadgeTa || '');
  const [heroSubtitleEn, setHeroSubtitleEn] = useState(siteConfig?.heroSubtitleEn || '');
  const [heroSubtitleTa, setHeroSubtitleTa] = useState(siteConfig?.heroSubtitleTa || '');
  const [sliderPhotos, setSliderPhotos] = useState<LandingSlidePhoto[]>(
    siteConfig?.sliderPhotos || []
  );
  const [highlights, setHighlights] = useState<LandingHighlight[]>(siteConfig?.highlights || []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!siteConfig) return;
    setAppTitleEn(siteConfig.appTitleEn);
    setAppTitleTa(siteConfig.appTitleTa);
    setLogoDataUrl(siteConfig.logoDataUrl);
    setHeroBadgeEn(siteConfig.heroBadgeEn || '');
    setHeroBadgeTa(siteConfig.heroBadgeTa || '');
    setHeroSubtitleEn(siteConfig.heroSubtitleEn);
    setHeroSubtitleTa(siteConfig.heroSubtitleTa);
    setSliderPhotos(siteConfig.sliderPhotos || []);
    setHighlights(siteConfig.highlights || []);
  }, [siteConfig]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setNotice(null);
    try {
      const url = await resizeImageToDataUrl(file, {
        maxDim: 256,
        maxBytes: 900 * 1024,
        preservePng: true,
      });
      setLogoDataUrl(url);
    } catch (err: any) {
      setError(err.message || 'Failed to upload logo.');
    }
  };

  const handleSlidesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setError(null);
    setNotice(null);
    try {
      const remainingSlots = Math.max(0, 10 - sliderPhotos.length);
      const selected = files.slice(0, remainingSlots);
      const added: LandingSlidePhoto[] = [];
      for (const file of selected) {
        const url = await resizeImageToDataUrl(file, {
          maxDim: 1280,
          maxBytes: 1400 * 1024,
          preservePng: false,
        });
        added.push({
          id: `slide-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          imageDataUrl: url,
          captionEn: '',
          captionTa: '',
        });
      }
      setSliderPhotos((prev) => [...prev, ...added]);
    } catch (err: any) {
      setError(err.message || 'Failed to process slider photo.');
    }
  };

  const moveSlide = (index: number, delta: -1 | 1) => {
    setSliderPhotos((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const moveHighlight = (index: number, delta: -1 | 1) => {
    setHighlights((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ config: SiteConfig }>('/api/admin/site-config', {
        method: 'PUT',
        body: JSON.stringify({
          appTitleEn,
          appTitleTa,
          logoDataUrl,
          heroBadgeEn,
          heroBadgeTa,
          heroSubtitleEn,
          heroSubtitleTa,
          sliderPhotos,
          highlights,
        }),
      });
      if (res.config) {
        onConfigUpdated(res.config);
      }
      setNotice(lang === 'ta' ? 'முகப்பு வடிவமைப்பு சேமிக்கப்பட்டது.' : 'Landing page updated.');
    } catch (err: any) {
      setError(err.message || 'Failed to save landing page configuration.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          {t.landingDesigner}
        </h1>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-900 disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          <span>{saving ? t.loading : t.save}</span>
        </button>
      </div>

      {notice && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Brand Identity: Logo, App Title, Hero Text */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          {t.brandLogo} &amp; {t.appTitleEn}
        </h2>

        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
            {logoDataUrl ? (
              <img src={logoDataUrl} alt="Logo" className="h-full w-full object-contain p-1" />
            ) : (
              <span className="font-display text-sm font-bold text-emerald-800 dark:text-emerald-400">
                VWF
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              {t.brandLogo}
            </div>
            <div className="text-[11px] text-slate-500">{t.photoHint}</div>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              ref={logoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              title={t.uploadPhoto}
              aria-label={t.uploadPhoto}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <Upload className="h-4 w-4" />
            </button>
            {logoDataUrl && (
              <button
                type="button"
                onClick={() => setLogoDataUrl(null)}
                title={t.deleteLabel}
                aria-label={t.deleteLabel}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.appTitleEn} *
            </label>
            <input
              type="text"
              required
              maxLength={100}
              value={appTitleEn}
              onChange={(e) => setAppTitleEn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t.appTitleTa} *
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={appTitleTa}
              onChange={(e) => setAppTitleTa(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Tagline (EN)
            </label>
            <input
              type="text"
              maxLength={140}
              value={heroBadgeEn}
              onChange={(e) => setHeroBadgeEn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Tagline (TA)
            </label>
            <input
              type="text"
              maxLength={160}
              value={heroBadgeTa}
              onChange={(e) => setHeroBadgeTa(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Intro (EN) *
            </label>
            <textarea
              rows={2}
              required
              maxLength={500}
              value={heroSubtitleEn}
              onChange={(e) => setHeroSubtitleEn(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
              Intro (TA) *
            </label>
            <textarea
              rows={2}
              required
              maxLength={500}
              value={heroSubtitleTa}
              onChange={(e) => setHeroSubtitleTa(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        </div>
      </section>

      {/* Photo Slider Manager */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t.sliderPhotos} ({sliderPhotos.length}/10)
          </h2>
          <div>
            <input
              ref={slidesInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp"
              onChange={handleSlidesUpload}
              className="hidden"
            />
            <button
              type="button"
              disabled={sliderPhotos.length >= 10}
              onClick={() => slidesInputRef.current?.click()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <ImagePlus className="h-3.5 w-3.5" />
              <span>{t.addPhotos}</span>
            </button>
          </div>
        </div>

        {sliderPhotos.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-500 dark:border-slate-700">
            {t.noData}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {sliderPhotos.map((slide, idx) => (
              <div
                key={slide.id}
                className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center dark:border-slate-800 dark:bg-slate-950/60"
              >
                <img
                  src={slide.imageDataUrl}
                  alt={slide.captionEn || `Slide ${idx + 1}`}
                  className="h-20 w-36 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                />
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    maxLength={180}
                    value={slide.captionEn}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSliderPhotos((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, captionEn: val } : s))
                      );
                    }}
                    placeholder="Caption (EN)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                  <input
                    type="text"
                    maxLength={220}
                    value={slide.captionTa}
                    onChange={(e) => {
                      const val = e.target.value;
                      setSliderPhotos((prev) =>
                        prev.map((s, i) => (i === idx ? { ...s, captionTa: val } : s))
                      );
                    }}
                    placeholder="Caption (TA)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveSlide(idx, -1)}
                    title="Move Up"
                    aria-label="Move Up"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === sliderPhotos.length - 1}
                    onClick={() => moveSlide(idx, 1)}
                    title="Move Down"
                    aria-label="Move Down"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setSliderPhotos((prev) => prev.filter((_, i) => i !== idx))
                    }
                    title={t.deleteLabel}
                    aria-label={t.deleteLabel}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Landing Content Blocks */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t.landingContent} ({highlights.length}/8)
          </h2>
          <button
            type="button"
            disabled={highlights.length >= 8}
            onClick={() =>
              setHighlights((prev) => [
                ...prev,
                {
                  id: `h-${Date.now()}`,
                  titleEn: '',
                  titleTa: '',
                  bodyEn: '',
                  bodyTa: '',
                },
              ])
            }
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{t.addBlock}</span>
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {highlights.map((h, idx) => (
            <div
              key={h.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-slate-500">
                  #{String(idx + 1).padStart(2, '0')}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveHighlight(idx, -1)}
                    title="Move Up"
                    aria-label="Move Up"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === highlights.length - 1}
                    onClick={() => moveHighlight(idx, 1)}
                    title="Move Down"
                    aria-label="Move Down"
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setHighlights((prev) => prev.filter((_, i) => i !== idx))
                    }
                    title={t.deleteLabel}
                    aria-label={t.deleteLabel}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-900 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <input
                  type="text"
                  required
                  maxLength={100}
                  value={h.titleEn}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHighlights((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, titleEn: val } : item))
                    );
                  }}
                  placeholder="Title (EN) *"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="text"
                  maxLength={120}
                  value={h.titleTa}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHighlights((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, titleTa: val } : item))
                    );
                  }}
                  placeholder="Title (TA)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="text"
                  required
                  maxLength={280}
                  value={h.bodyEn}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHighlights((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, bodyEn: val } : item))
                    );
                  }}
                  placeholder="Description (EN) *"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="text"
                  maxLength={320}
                  value={h.bodyTa}
                  onChange={(e) => {
                    const val = e.target.value;
                    setHighlights((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, bodyTa: val } : item))
                    );
                  }}
                  placeholder="Description (TA)"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>
          ))}
        </div>
      </section>
    </form>
  );
};
