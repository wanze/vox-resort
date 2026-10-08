import type { SharedResort } from '../domain/sharedResort';

export type IncomingShare =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly shared: SharedResort }
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'newer' };
