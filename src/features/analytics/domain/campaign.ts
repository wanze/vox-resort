import type { EventDraft } from './analyticsEvent';

type Campaign = Pick<EventDraft, 'source' | 'medium' | 'campaign'>;

const MAX_LENGTH = 64;

const cleaned = (value: string | null): string | null => {
  const trimmed = value?.trim().toLowerCase().slice(0, MAX_LENGTH) ?? '';
  return trimmed === '' ? null : trimmed;
};

// Only the utm_ tags an ad or a post carries; the referrer itself is Web Analytics' to count.
export function campaignOf(search: string): Campaign {
  const params = new URLSearchParams(search);
  const source = cleaned(params.get('utm_source'));
  const medium = cleaned(params.get('utm_medium'));
  const campaign = cleaned(params.get('utm_campaign'));
  return {
    ...(source === null ? {} : { source }),
    ...(medium === null ? {} : { medium }),
    ...(campaign === null ? {} : { campaign }),
  };
}
