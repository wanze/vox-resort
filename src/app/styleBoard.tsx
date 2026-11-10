import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Styleguide } from './Styleguide';
import '@fontsource-variable/pixelify-sans/index.css';
import '@fontsource/silkscreen/latin-400.css';
import './styles.css';
import './styleguide.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <Styleguide />
  </StrictMode>,
);
