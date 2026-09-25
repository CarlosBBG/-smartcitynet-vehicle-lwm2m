import 'leaflet/dist/leaflet.css';
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';

const root = document.getElementById('root');
if (!root) throw new Error('No se encontró el contenedor principal');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
