import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import '@fontsource-variable/pixelify-sans/index.css';
import '@fontsource/silkscreen/latin-400.css';
import './app/styles.css';

const WELCOME_FONTS = [
  '16px "Jersey HUD"',
  '700 16px "Pixelify Sans Variable"',
  '16px "Silkscreen"',
];
const FONT_WAIT_MS = 1500;

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

const fontsLoaded = Promise.all(WELCOME_FONTS.map((font) => document.fonts.load(font)));
const waited = new Promise((resolve) => setTimeout(resolve, FONT_WAIT_MS));

void Promise.race([fontsLoaded, waited])
  .catch(() => undefined)
  .then(() => {
    createRoot(container).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  });
