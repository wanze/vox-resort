import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Styleguide } from './Styleguide';
import { startLook } from '../features/hud/adapters/lookStore';
import '@fontsource-variable/pixelify-sans/index.css';
import '@fontsource/silkscreen/latin-400.css';
import './styles.css';
import './styleguide.css';

startLook();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <Styleguide />
  </StrictMode>,
);
