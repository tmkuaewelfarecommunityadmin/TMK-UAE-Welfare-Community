// In-memory auth token store (never written to localStorage/sessionStorage)
let activeTokenProvider: (() => Promise<string | null>) | null = null;
let memorySessionToken: string | null = null;

export function setMemorySessionToken(token: string | null) {
  memorySessionToken = token;
}

export function setFirebaseTokenProvider(provider: (() => Promise<string | null>) | null) {
  activeTokenProvider = provider;
}

export async function getActiveBearerToken(): Promise<string | null> {
  if (memorySessionToken) return memorySessionToken;
  if (activeTokenProvider) return await activeTokenProvider();
  return null;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, headers, ...rest } = options;
  const reqHeaders = new Headers(headers || {});
  if (!reqHeaders.has('Content-Type') && rest.body && typeof rest.body === 'string') {
    reqHeaders.set('Content-Type', 'application/json');
  }

  if (!skipAuth) {
    const token = await getActiveBearerToken();
    if (token) {
      reqHeaders.set('Authorization', `Bearer ${token}`);
    }
  }

  const res = await fetch(path, {
    ...rest,
    headers: reqHeaders,
  });

  const contentType = res.headers.get('content-type') || '';
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    if (contentType.includes('application/json')) {
      const errJson = await res.json().catch(() => null);
      if (errJson?.error) message = errJson.error;
      if (errJson?.code) code = String(errJson.code);
    }
    throw Object.assign(new Error(message), { status: res.status, code });
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function fetchAuthorizedAttachmentBlob(attachmentId: string): Promise<{
  blobUrl: string;
  mimeType: string;
}> {
  const token = await getActiveBearerToken();
  const res = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    throw new Error('Unable to load attachment.');
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  return { blobUrl, mimeType: blob.type };
}

export function fileToBase64Attachment(file: File): Promise<{
  fileName: string;
  mimeType: string;
  fileDataBase64: string;
}> {
  return new Promise((resolve, reject) => {
    if (file.size > 2 * 1024 * 1024) {
      reject(new Error('File exceeds 2 MB limit.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileDataBase64: String(reader.result || ''),
      });
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}
