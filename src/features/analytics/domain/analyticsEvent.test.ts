import { describe, expect, it } from 'vitest';
import {
  dataPointOf,
  eventSchema,
  MAX_EVENTS,
  NUMBER_COLUMNS,
  readBatch,
  TEXT_COLUMNS,
  type AnalyticsEvent,
} from './analyticsEvent';

const visitor = { country: 'CH', os: 'macos', browser: 'safari', device: 'desktop' };

const body = (value: unknown): string => JSON.stringify(value);

const played: AnalyticsEvent = { name: 'played', elapsedMs: 5_000, visibleMs: 4_000, guests: 12 };

describe('readBatch', () => {
  it('reads a batch the tracker sends', () => {
    const batch = { session: 'abc123def456', events: [played] };
    expect(readBatch(body(batch))).toEqual(batch);
  });

  it('refuses what is not JSON', () => {
    expect(readBatch('{')).toBeNull();
  });

  it('refuses an unknown event', () => {
    const events = [{ name: 'hack', elapsedMs: 0 }];
    expect(readBatch(body({ session: 'abc123def456', events }))).toBeNull();
  });

  it('refuses fields it does not store', () => {
    const events = [{ ...played, email: 'a@b.c' }];
    expect(readBatch(body({ session: 'abc123def456', events }))).toBeNull();
  });

  it('refuses a session that is not one of its own', () => {
    expect(readBatch(body({ session: 'x', events: [played] }))).toBeNull();
  });

  it('refuses more events than one beacon carries', () => {
    const events = Array.from({ length: MAX_EVENTS + 1 }, () => played);
    expect(readBatch(body({ session: 'abc123def456', events }))).toBeNull();
  });

  it('refuses a number that would swamp a sum', () => {
    const events = [{ ...played, guests: 1e15 }];
    expect(readBatch(body({ session: 'abc123def456', events }))).toBeNull();
  });
});

describe('dataPointOf', () => {
  it('keys the point by session and leads with the event and the visitor', () => {
    const point = dataPointOf('abc123def456', played, visitor);
    expect(point.indexes).toEqual(['abc123def456']);
    expect(point.blobs.slice(0, 5)).toEqual(['played', 'CH', 'macos', 'safari', 'desktop']);
  });

  it('puts every field in its own column', () => {
    const point = dataPointOf('abc123def456', played, visitor);
    expect(point.doubles[NUMBER_COLUMNS.indexOf('guests')]).toBe(12);
    expect(point.doubles[NUMBER_COLUMNS.indexOf('visibleMs')]).toBe(4_000);
  });

  it('fills a field the event lacks', () => {
    const point = dataPointOf('abc123def456', played, visitor);
    expect(point.blobs[5 + TEXT_COLUMNS.indexOf('mode')]).toBe('');
    expect(point.doubles[NUMBER_COLUMNS.indexOf('balance')]).toBe(0);
  });

  it('stays within what Analytics Engine stores', () => {
    const point = dataPointOf('abc123def456', played, visitor);
    expect(point.blobs.length).toBeLessThanOrEqual(20);
    expect(point.doubles.length).toBeLessThanOrEqual(20);
  });

  it('gives every field of an event a column', () => {
    const columns = ['name', ...TEXT_COLUMNS, ...NUMBER_COLUMNS];
    expect(columns.toSorted()).toEqual(Object.keys(eventSchema.shape).toSorted());
  });
});
