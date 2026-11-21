const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''

export function apiUrl(path: string): string {
  const cleanBase = BASE.replace(/\/+$/, '')
  const cleanPath = path.startsWith('/') ? path : '/' + path
  return cleanBase ? `${cleanBase}${cleanPath}` : cleanPath
}
