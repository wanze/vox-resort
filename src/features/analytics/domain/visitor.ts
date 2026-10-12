import type { Visitor } from './analyticsEvent';

const BOT =
  /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|curl|wget|python|go-http|java\//i;

// Matched in order: an iPad and Chrome on Android both also say Safari, Edge also says Chrome.
const SYSTEMS: readonly (readonly [RegExp, string])[] = [
  [/iPhone|iPad|iPod/, 'ios'],
  [/Android/, 'android'],
  [/CrOS/, 'chromeos'],
  [/Windows/, 'windows'],
  [/Macintosh|Mac OS X/, 'macos'],
  [/Linux/, 'linux'],
];

const BROWSERS: readonly (readonly [RegExp, string])[] = [
  [/Edg(e|A|iOS)?\//, 'edge'],
  [/OPR\/|Opera/, 'opera'],
  [/SamsungBrowser/, 'samsung'],
  [/Firefox|FxiOS/, 'firefox'],
  [/Chrome|CriOS/, 'chrome'],
  [/Safari/, 'safari'],
];

const DEVICES: readonly (readonly [RegExp, string])[] = [
  [/iPad|Tablet/, 'tablet'],
  [/Mobi|iPhone|iPod/, 'mobile'],
  // Android phones say Mobile; an Android that does not is a tablet.
  [/Android/, 'tablet'],
];

const firstOf = (
  table: readonly (readonly [RegExp, string])[],
  userAgent: string,
  fallback: string,
): string => table.find(([pattern]) => pattern.test(userAgent))?.[1] ?? fallback;

export const isBot = (userAgent: string): boolean => userAgent === '' || BOT.test(userAgent);

export function visitorOf(userAgent: string, country: string | undefined): Visitor {
  return {
    country: country ?? '',
    os: firstOf(SYSTEMS, userAgent, 'other'),
    browser: firstOf(BROWSERS, userAgent, 'other'),
    device: firstOf(DEVICES, userAgent, 'desktop'),
  };
}
