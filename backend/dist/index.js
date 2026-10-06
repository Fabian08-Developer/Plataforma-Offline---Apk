"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./config/env");
const db_1 = require("./config/db");
const logger_1 = require("./middlewares/logger");
const routes_1 = __importDefault(require("./routes"));
const app = (0, express_1.default)();
// Solo confiar en las cabeceras de proxy de la cantidad de saltos configurada (TRUST_PROXY)
app.set('trust proxy', env_1.TRUST_PROXY);
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Sin cabecera Origin (herramientas o servidor a servidor) no aplica CORS
        if (!origin || env_1.CORS_ORIGINS.includes(origin))
            return callback(null, true);
        callback(null, false);
    },
}));
// Límite explícito del cuerpo JSON (el lote de sincronización máximo ronda los cientos de KB)
app.use(express_1.default.json({ limit: '2mb' }));
app.use(logger_1.requestLogger);
// Archivos estáticos — APK público
if (!fs_1.default.existsSync(env_1.apkDir)) {
    fs_1.default.mkdirSync(env_1.apkDir, { recursive: true });
}
app.use('/api/apk', express_1.default.static(env_1.apkDir));
app.use('/apk', express_1.default.static(env_1.apkDir));
// Rutas de la API (soporte dual: con prefijo /api y sin prefijo para compatibilidad total)
app.use('/api', routes_1.default);
app.use('/', routes_1.default);
// Inicializar tablas de auditoría requeridas en segundo plano
(0, db_1.initAuditTables)().catch((err) => {
    console.warn('Nota sobre tablas de auditoría:', err.message);
});
// Iniciar servidor HTTP
app.listen(env_1.PORT, () => {
    console.log(`Servidor Backend corriendo en http://localhost:${env_1.PORT}`);
});
exports.default = app;
