import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader';
import './index.css';
import App from './App.tsx';
import { dbService } from './db.ts';

async function bootstrap() {
  if (Capacitor.getPlatform() === 'web') {
    // Definir componente web para jeep-sqlite
    jeepSqlite(window);
    
    // Crear el elemento DOM requerido por jeep-sqlite
    const jeepEl = document.createElement('jeep-sqlite');
    document.body.appendChild(jeepEl);
    await customElements.whenDefined('jeep-sqlite');
  }

  try {
    // Inicializar SQLite
    await dbService.init();
    
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  } catch (error) {
    console.error('Error during app bootstrap:', error);
    document.getElementById('root')!.innerHTML = '<div style="padding: 20px; color: red;">Error initializing database. Check console.</div>';
  }
}

bootstrap();
