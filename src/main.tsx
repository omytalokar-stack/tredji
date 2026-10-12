import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App.tsx';
import { PaperTradingProvider } from './hooks/usePaperTrading';
import './index.css';

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <PaperTradingProvider>
    <App />
  </PaperTradingProvider>
);
