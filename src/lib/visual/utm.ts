/**
 * UTM parameter preservation for marketing campaigns
 * Persists UTMs for 30 days across navigation
 */

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

const UTM_STORAGE_KEY = 'orbis_utm';
const UTM_EXPIRY_DAYS = 30;

/**
 * Extract UTM parameters from URL search params
 */
export function extractUtmParams(searchParams: URLSearchParams): UtmParams {
  const utmParams: UtmParams = {};
  
  const keys: (keyof UtmParams)[] = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
  ];
  
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) {
      utmParams[key] = value;
    }
  }
  
  return utmParams;
}

/**
 * Get persisted UTM params from sessionStorage/cookie (client-side only)
 */
export function getPersistedUtms(): UtmParams {
  if (typeof window === 'undefined') return {};
  
  try {
    // Try sessionStorage first
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    if (stored) {
      const { params, expiry } = JSON.parse(stored);
      if (Date.now() < expiry) {
        return params;
      }
      // Expired, clear it
      sessionStorage.removeItem(UTM_STORAGE_KEY);
    }
  } catch (e) {
    // Ignore errors
  }
  
  return {};
}

/**
 * Persist UTM params for 30 days (client-side only)
 */
export function persistUtms(params: UtmParams): void {
  if (typeof window === 'undefined') return;
  
  try {
    const expiry = Date.now() + (UTM_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ params, expiry }));
  } catch (e) {
    // Ignore errors (Safari private mode, etc.)
  }
}

/**
 * Merge current UTMs with persisted ones (current takes precedence)
 */
export function mergeUtms(current: UtmParams): UtmParams {
  const persisted = getPersistedUtms();
  return { ...persisted, ...current };
}

/**
 * Build URL with preserved UTM parameters
 */
export function buildUrlWithUtm(
  baseUrl: string,
  utm: UtmParams,
  additionalParams?: Record<string, string>
): string {
  const url = new URL(baseUrl, 'https://placeholder.com');
  
  // Merge with persisted UTMs (current takes precedence)
  const mergedUtm = mergeUtms(utm);
  
  // Set default utm_campaign if missing
  if (!mergedUtm.utm_campaign) {
    mergedUtm.utm_campaign = 'orbis';
  }
  
  // Add UTM params
  for (const [key, value] of Object.entries(mergedUtm)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  
  // Add additional params
  if (additionalParams) {
    for (const [key, value] of Object.entries(additionalParams)) {
      if (value) {
        url.searchParams.set(key, value);
      }
    }
  }
  
  return url.pathname + url.search;
}

/**
 * Serialize UTM params to query string
 */
export function utmToQueryString(utm: UtmParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(utm)) {
    if (value) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}
