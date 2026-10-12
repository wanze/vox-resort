import { describe, expect, it } from 'vitest';
import { isBot, visitorOf } from './visitor';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 15; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
const EDGE =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
const FIREFOX_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 15.0; rv:143.0) Gecko/20100101 Firefox/143.0';
const GOOGLEBOT =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

describe('visitorOf', () => {
  it('reads an iPhone', () => {
    expect(visitorOf(IPHONE, 'CH')).toEqual({
      country: 'CH',
      os: 'ios',
      browser: 'safari',
      device: 'mobile',
    });
  });

  it('tells an Android phone from an Android tablet', () => {
    expect(visitorOf(ANDROID_PHONE, 'DE').device).toBe('mobile');
    expect(visitorOf(ANDROID_TABLET, 'DE').device).toBe('tablet');
    expect(visitorOf(ANDROID_TABLET, 'DE').browser).toBe('chrome');
  });

  it('reads Edge before the Chrome it also claims to be', () => {
    expect(visitorOf(EDGE, 'US')).toMatchObject({ os: 'windows', browser: 'edge' });
  });

  it('reads Firefox on a Mac as a desktop', () => {
    expect(visitorOf(FIREFOX_MAC, 'FR')).toMatchObject({
      os: 'macos',
      browser: 'firefox',
      device: 'desktop',
    });
  });

  it('leaves the country empty where Cloudflare has none', () => {
    expect(visitorOf(IPHONE, undefined).country).toBe('');
  });
});

describe('isBot', () => {
  it('knows a crawler', () => {
    expect(isBot(GOOGLEBOT)).toBe(true);
  });

  it('knows a script', () => {
    expect(isBot('curl/8.7.1')).toBe(true);
    expect(isBot('')).toBe(true);
  });

  it('lets a browser through', () => {
    expect(isBot(IPHONE)).toBe(false);
    expect(isBot(EDGE)).toBe(false);
  });
});
