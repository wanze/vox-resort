import { offerLine, settlementLine } from '../../bookings/domain/bookingWords';
import type { BookingNews } from '../../hud/domain/news';
import { TICKS_PER_DAY } from '../../sim/domain/simClock';

export const bookingNewsLine = (news: BookingNews): string =>
  news.kind === 'offer'
    ? offerLine(news.offer, Math.floor(news.at / TICKS_PER_DAY))
    : settlementLine(news.settlement);

export const bookingNewsTitle = (news: BookingNews): string =>
  news.kind === 'offer' ? 'Group booking offer' : 'Group booking settled';
