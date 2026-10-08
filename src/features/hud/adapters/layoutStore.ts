import { jsonStore } from '../../saves/adapters/jsonStore';
import { DEFAULT_LAYOUT, parseLayout, type WindowLayout } from '../domain/windowLayout';

const store = jsonStore('vox-resort:windows', DEFAULT_LAYOUT, parseLayout);

export const loadLayout = (): WindowLayout => store.load();
export const saveLayout = (layout: WindowLayout): void => store.save(layout);
