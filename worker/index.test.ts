import { describe, expect, it } from 'vitest';
import worker from './index';

const SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';

const batch = { session: 'abc123def456', events: [{ name: 'played', elapsedMs: 9, guests: 3 }] };

function envWith(allowed = true) {
  const written: unknown[] = [];
  const env = {
    EVENTS: { writeDataPoint: (point: unknown) => void written.push(point) },
    EVENT_LIMIT: { limit: () => Promise.resolve({ success: allowed }) },
  };
  return { env: env as unknown as Parameters<typeof worker.fetch>[1], written };
}

function post(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://vox-resort.com/e', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Origin: 'https://vox-resort.com', 'User-Agent': SAFARI, ...headers },
  });
}

const fetchOf = (request: Request, env: Parameters<typeof worker.fetch>[1]) =>
  worker.fetch(request as Parameters<typeof worker.fetch>[0], env);

describe('the analytics worker', () => {
  it('writes each event of a beacon from the game', async () => {
    const { env, written } = envWith();
    const response = await fetchOf(post(batch), env);
    expect(response.status).toBe(204);
    expect(written).toEqual([
      expect.objectContaining({
        indexes: ['abc123def456'],
        blobs: expect.arrayContaining(['played', 'macos', 'safari']),
      }),
    ]);
  });

  it('refuses a post from another site', async () => {
    const { env, written } = envWith();
    const response = await fetchOf(post(batch, { Origin: 'https://example.com' }), env);
    expect(response.status).toBe(403);
    expect(written).toEqual([]);
  });

  it('quietly drops a crawler', async () => {
    const { env, written } = envWith();
    const response = await fetchOf(post(batch, { 'User-Agent': 'Googlebot/2.1' }), env);
    expect(response.status).toBe(204);
    expect(written).toEqual([]);
  });

  it('turns away a sender over its limit', async () => {
    const { env, written } = envWith(false);
    expect((await fetchOf(post(batch), env)).status).toBe(429);
    expect(written).toEqual([]);
  });

  it('refuses a batch it cannot read', async () => {
    const { env, written } = envWith();
    expect((await fetchOf(post({ session: 'abc123def456', events: [] }), env)).status).toBe(400);
    expect(written).toEqual([]);
  });

  it('refuses a body larger than any batch, however it is announced', async () => {
    const { env } = envWith();
    const padded = { ...batch, padding: 'x'.repeat(20_000) };
    expect((await fetchOf(post(padded), env)).status).toBe(400);
  });

  it('answers any other path with not found', async () => {
    const { env } = envWith();
    const response = await fetchOf(new Request('https://vox-resort.com/wp-login.php'), env);
    expect(response.status).toBe(404);
  });
});
