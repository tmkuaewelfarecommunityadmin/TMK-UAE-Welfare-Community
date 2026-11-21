import React, { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { fetchAuthorizedAttachmentBlob } from '../api/client';

export const AttachmentPreviewModal: React.FC<{
  attachmentId: string | null;
  fileName: string;
  onClose: () => void;
}> = ({ attachmentId, fileName, onClose }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!attachmentId) return;
    let active = true;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);

    fetchAuthorizedAttachmentBlob(attachmentId)
      .then((res) => {
        if (!active) {
          URL.revokeObjectURL(res.blobUrl);
          return;
        }
        createdUrl = res.blobUrl;
        setBlobUrl(res.blobUrl);
        setMimeType(res.mimeType);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Unable to load attachment.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
      setBlobUrl(null);
    };
  }, [attachmentId]);

  if (!attachmentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="flex items-center gap-2 truncate">
            <FileText className="h-4 w-4 shrink-0 text-emerald-800 dark:text-emerald-400" />
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {fileName}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close preview"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 p-4 dark:bg-slate-950">
          {loading && <p className="py-12 text-center text-sm text-slate-500">Loading document...</p>}
          {error && <p className="py-12 text-center text-sm text-red-600">{error}</p>}
          {!loading && !error && blobUrl && (
            <>
              {mimeType.startsWith('image/') ? (
                <img
                  src={blobUrl}
                  alt={fileName}
                  referrerPolicy="no-referrer"
                  className="mx-auto max-h-[70vh] rounded-lg border border-slate-200 object-contain dark:border-slate-800"
                />
              ) : (
                <iframe
                  src={blobUrl}
                  title={fileName}
                  className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-800"
                />
              )}
              <div className="mt-3 flex justify-end">
                <a
                  href={blobUrl}
                  download={fileName}
                  className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  Download File
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
