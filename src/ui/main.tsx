// Giriş noktası: yazı tipleri (siteye gömülü, çevrimdışı çalışır), stiller, uygulama, API.
import '@fontsource/barlow/400.css';
import '@fontsource/barlow/500.css';
import '@fontsource/barlow/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installApi } from './api';
import { useStore } from './state/store';

document.documentElement.dataset.theme = useStore.getState().settings.theme;
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
installApi();
