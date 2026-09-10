/**
 * UTM parameter preservation for marketing campaigns
 */

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

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
 * Build URL with preserved UTM parameters
 */
export function buildUrlWithUtm(
  baseUrl: string,
  utm: UtmParams,
  additionalParams?: Record<string, string>
): string {
  const url = new URL(baseUrl, 'https://placeholder.com');
  
  // Add UTM params
  for (const [key, value] of Object.entries(utm)) {
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
