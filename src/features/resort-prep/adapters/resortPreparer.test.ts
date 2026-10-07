import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrepRequest } from '../domain/prepareResort';
import type { PrepAnswer, PrepMessage } from './prepWorker';
import { createResortPreparer } from './resortPreparer';

type Listener = (event: unknown) => void;

const workers: FakeWorker[] = [];

class FakeWorker {
  readonly posted: PrepMessage[] = [];
  terminated = false;
  private readonly listeners = new Map<string, Listener[]>();

  constructor() {
    workers.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  postMessage(message: PrepMessage): void {
    this.posted.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  answer(data: PrepAnswer): void {
    for (const listener of this.listeners.get('message') ?? []) listener({ data });
  }

  crash(message: string): void {
    for (const listener of this.listeners.get('error') ?? []) listener({ message });
  }
}

const BARE: PrepRequest = {
  source: { kind: 'clear', params: { tilesX: 48, tilesZ: 48, density: 0.6, seed: 1 } },
  repeat: 1,
  view: null,
};

describe('createResortPreparer', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    workers.length = 0;
  });

  it('refuses a job whose worker crashed after it started, and starts a new worker next time', async () => {
    const preparer = createResortPreparer();
    const crashed = preparer.prepare(BARE);
    const worker = workers[0]!;
    worker.answer({ ready: true });
    worker.crash('out of memory');
    await expect(crashed).rejects.toThrow('out of memory');
    expect(worker.terminated).toBe(true);

    const next = preparer.prepare(BARE);
    expect(workers).toHaveLength(2);
    preparer.dispose();
    await expect(next).rejects.toThrow();
  });

  it('prepares on the main thread when the worker could not start', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const preparer = createResortPreparer();
    const prepared = preparer.prepare(BARE);
    workers[0]!.crash('no such module');
    await expect(prepared).resolves.toMatchObject({ plan: { tilesX: 48, tilesZ: 48 } });
  });

  it('refuses a job the worker answered with an error', async () => {
    const preparer = createResortPreparer();
    const failed = preparer.prepare(BARE);
    const worker = workers[0]!;
    worker.answer({ ready: true });
    worker.answer({ id: worker.posted[0]!.id, error: 'no room' });
    await expect(failed).rejects.toThrow('no room');
    expect(workers).toHaveLength(1);
    preparer.dispose();
  });
});
