export const WINDOW_TABS = {
  overview: ['summary', 'report', 'demand', 'photos'],
  inbox: ['advice', 'messages'],
  people: ['guests', 'staff'],
} as const;

export type TabbedWindow = keyof typeof WINDOW_TABS;
export type TabId = (typeof WINDOW_TABS)[TabbedWindow][number];

const HOSTS = Object.keys(WINDOW_TABS) as TabbedWindow[];

export function isTabbed(id: string): id is TabbedWindow {
  return Object.hasOwn(WINDOW_TABS, id);
}

export function isTab(page: string): page is TabId {
  return HOSTS.some((host) => (WINDOW_TABS[host] as readonly string[]).includes(page));
}

export function hostOfTab(tab: TabId): TabbedWindow {
  const host = HOSTS.find((each) => (WINDOW_TABS[each] as readonly string[]).includes(tab));
  if (host === undefined) throw new Error(`No window hosts the tab ${tab}`);
  return host;
}
