const DEFAULT_BACKEND_URL = 'https://tredji.onrender.com';

export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL?.trim() || DEFAULT_BACKEND_URL
).replace(/\/+$/, '');

export function backendApiUrl(path: string): string {
  return `${BACKEND_URL}/${path.replace(/^\/+/, '')}`;
}
