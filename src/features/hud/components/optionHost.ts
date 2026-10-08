import { createContext } from 'react';

// Outside a menu a row is a plain button: a menu role there would promise keys nothing handles.
export const OptionHost = createContext<'menu' | 'plain'>('plain');
