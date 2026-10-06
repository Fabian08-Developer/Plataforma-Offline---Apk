"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.apkDir = exports.publicPath = exports.TRUST_PROXY = exports.CORS_ORIGINS = exports.DATABASE_URL = exports.JWT_SECRET = exports.PORT = void 0;
require("dotenv/config");
const path_1 = __importDefault(require("path"));
function requireEnv(name, minLength = 1) {
    const value = process.env[name]?.trim() ?? '';
    if (value.length < minLength) {
        throw new Error(`Variable de entorno ${name} no definida o demasiado corta (mínimo ${minLength} caracteres).`);
    }
    return value;
}
exports.PORT = Number(process.env.PORT) || 3005;
// Sin valor por defecto: un secreto conocido permitiría firmar tokens de administrador.
exports.JWT_SECRET = requireEnv('JWT_SECRET', 32);
exports.DATABASE_URL = requireEnv('DATABASE_URL');
const esProduccion = process.env.NODE_ENV === 'production';
// Orígenes permitidos por CORS. Las apps nativas Capacitor usan https://localhost (Android)
// y capacitor://localhost (iOS). Orígenes adicionales se configuran con CORS_ORIGINS (separados por coma).
exports.CORS_ORIGINS = [
    'https://localhost',
    'capacitor://localhost',
    ...(esProduccion ? [] : ['http://localhost:5173']),
    ...(process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
];
// Número de proxies inversos delante de la API (0 si el servidor no está detrás de ninguno).
// Necesario para que el rate limit use la IP real del cliente.
exports.TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 1);
exports.publicPath = path_1.default.join(__dirname, '..', '..', 'public');
exports.apkDir = path_1.default.join(exports.publicPath, 'apk');
