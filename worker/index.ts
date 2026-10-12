import { refusalOf, type RequestFacts } from '../src/features/analytics/domain/admission';
import {
  dataPointOf,
  EVENTS_PATH,
  MAX_BODY_BYTES,
  readBatch,
  type EventBatch,
} from '../src/features/analytics/domain/analyticsEvent';
import { isBot, visitorOf } from '../src/features/analytics/domain/visitor';

interface Env {
  readonly EVENTS: AnalyticsEngineDataset;
  readonly EVENT_LIMIT: RateLimit;
}

const empty = (status: number): Response => new Response(null, { status });

const factsOf = (request: Request): RequestFacts => {
  const length = request.headers.get('Content-Length');
  return {
    method: request.method,
    url: request.url,
    origin: request.headers.get('Origin'),
    fetchSite: request.headers.get('Sec-Fetch-Site'),
    length: length === null ? null : Number(length),
  };
};

// Content-Length can be left out, so the body is measured as well.
async function batchOf(request: Request): Promise<EventBatch | null> {
  const body = await request.text();
  return body.length > MAX_BODY_BYTES ? null : readBatch(body);
}

async function collect(request: Request, env: Env): Promise<Response> {
  const refusal = refusalOf(factsOf(request));
  if (refusal !== null) return empty(refusal);
  // Answered as a success, so a crawler that runs the game has no reason to try again.
  const userAgent = request.headers.get('User-Agent') ?? '';
  if (isBot(userAgent)) return empty(204);
  const key = request.headers.get('CF-Connecting-IP') ?? '';
  if (!(await env.EVENT_LIMIT.limit({ key })).success) return empty(429);
  const batch = await batchOf(request);
  if (!batch) return empty(400);
  const visitor = visitorOf(userAgent, request.cf?.country as string | undefined);
  for (const event of batch.events) {
    env.EVENTS.writeDataPoint(dataPointOf(batch.session, event, visitor));
  }
  return empty(204);
}

// Every other path is served from dist/ before the Worker is asked; what reaches here matched
// no asset.
export default {
  fetch(request, env) {
    if (new URL(request.url).pathname === EVENTS_PATH) return collect(request, env);
    return Promise.resolve(empty(404));
  },
} satisfies ExportedHandler<Env>;
