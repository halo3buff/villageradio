export type GateDecision = 'pass' | 'notfound' | 'open';

const OPEN_ENDPOINTS = new Set(['/api/admin/login', '/api/admin/logout']);

/**
 * Pure gate decision used by the proxy (src/proxy.ts).
 * - 'open'     → auth endpoints, reachable without a session (still rate-limited)
 * - 'notfound' → gated admin route with no valid session → render a 404
 * - 'pass'     → everything else
 */
export function gateDecision(pathname: string, hasValidSession: boolean): GateDecision {
  const isAdmin =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/api/admin/');
  if (!isAdmin) return 'pass';
  if (OPEN_ENDPOINTS.has(pathname)) return 'open';
  return hasValidSession ? 'pass' : 'notfound';
}
