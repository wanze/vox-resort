import { describe, expect, it } from 'vitest';
import { STREAMED_MUSIC } from './precacheRules';

describe('STREAMED_MUSIC', () => {
  it('matches a bank file name', () => {
    expect(STREAMED_MUSIC.test('music-day-1.mp3')).toBe(true);
  });

  it('matches a hashed path in dist', () => {
    expect(STREAMED_MUSIC.test('assets/music-day-1-DjE6EjHO.mp3')).toBe(true);
  });

  it('matches the URL the worker sees', () => {
    expect(STREAMED_MUSIC.test('https://vox-resort.com/assets/music-menu-D8cPw0kp.mp3')).toBe(true);
  });

  it('leaves the loops in the precache', () => {
    expect(STREAMED_MUSIC.test('assets/arcade-dltNYSFe.mp3')).toBe(false);
    expect(STREAMED_MUSIC.test('club.mp3')).toBe(false);
  });

  it('wants music- at the start of the name', () => {
    expect(STREAMED_MUSIC.test('assets/beach-music-x.mp3')).toBe(false);
  });

  it('wants an mp3', () => {
    expect(STREAMED_MUSIC.test('assets/music-menu-x.png')).toBe(false);
  });
});
