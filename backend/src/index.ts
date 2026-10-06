import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { PORT, apkDir, CORS_ORIGINS, TRUST_PROXY } from './config/env';
import { initAuditTables } from './config/db';
import { requestLogger } from './middlewares/logger';
import apiRouter from './routes';

const app = express();

// Solo confiar en las cabeceras de proxy de la cantidad de saltos configurada (TRUST_PROXY)
app.set('trust proxy', TRUST_PROXY);
app.use(
  cors({
    origin: (origin, callback) => {
      // Sin cabecera Origin (herramientas o servidor a servidor) no aplica CORS
      if (!origin || CORS_ORIGINS.includes(origin)) return callback(null, true);
      callback(null, false);
    },
  })
);
// Límite explícito del cuerpo JSON (el lote de sincronización máximo ronda los cientos de KB)
app.use(express.json({ limit: '2mb' }));
app.use(requestLogger);

// Archivos estáticos — APK público
if (!fs.existsSync(apkDir)) {
  fs.mkdirSync(apkDir, { recursive: true });
}
app.use('/api/apk', express.static(apkDir));
app.use('/apk', express.static(apkDir));

// Rutas de la API (soporte dual: con prefijo /api y sin prefijo para compatibilidad total)
app.use('/api', apiRouter);
app.use('/', apiRouter);

// Inicializar tablas de auditoría requeridas en segundo plano
initAuditTables().catch((err) => {
  console.warn('Nota sobre tablas de auditoría:', err.message);
});

// Iniciar servidor HTTP
app.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});

export default app;
