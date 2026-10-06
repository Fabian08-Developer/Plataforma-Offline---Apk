import 'dotenv/config';
import path from 'path';

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name]?.trim() ?? '';
  if (value.length < minLength) {
    throw new Error(`Variable de entorno ${name} no definida o demasiado corta (mínimo ${minLength} caracteres).`);
  }
  return value;
}

export const PORT = Number(process.env.PORT) || 3005;

// Sin valor por defecto: un secreto conocido permitiría firmar tokens de administrador.
export const JWT_SECRET = requireEnv('JWT_SECRET', 32);
export const DATABASE_URL = requireEnv('DATABASE_URL');

const esProduccion = process.env.NODE_ENV === 'production';

// Orígenes permitidos por CORS. Las apps nativas Capacitor usan https://localhost (Android)
// y capacitor://localhost (iOS). Orígenes adicionales se configuran con CORS_ORIGINS (separados por coma).
export const CORS_ORIGINS: string[] = [
  'https://localhost',
  'capacitor://localhost',
  ...(esProduccion ? [] : ['http://localhost:5173']),
  ...(process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
];

// Número de proxies inversos delante de la API (0 si el servidor no está detrás de ninguno).
// Necesario para que el rate limit use la IP real del cliente.
export const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 1);

export const publicPath = path.join(__dirname, '..', '..', 'public');
export const apkDir = path.join(publicPath, 'apk');
