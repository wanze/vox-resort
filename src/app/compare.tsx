import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ModelCompare } from './ModelCompare';
import '@fontsource-variable/rubik/index.css';
import './compare.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <ModelCompare />
  </StrictMode>,
);
