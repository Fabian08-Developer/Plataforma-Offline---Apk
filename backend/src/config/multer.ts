import multer from 'multer';
import fs from 'fs';
import { apkDir } from './env';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(apkDir)) {
      fs.mkdirSync(apkDir, { recursive: true });
    }
    cb(null, apkDir);
  },
  filename: (_req, _file, cb) => {
    cb(null, `app-${Date.now()}.apk`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
  fileFilter: (_req, file, cb) => {
    // Primer filtro por nombre; la validación real del contenido se hace después (ver esApkValido)
    if (!file.originalname.toLowerCase().endsWith('.apk')) {
      cb(new Error('Solo se permiten archivos .apk'));
      return;
    }
    cb(null, true);
  },
});
