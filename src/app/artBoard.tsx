import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArtPreview } from './ArtPreview';
import '@fontsource-variable/pixelify-sans/index.css';
import '@fontsource/silkscreen/latin-400.css';
import './styles.css';
import './artBoard.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ArtPreview />
  </StrictMode>,
);
