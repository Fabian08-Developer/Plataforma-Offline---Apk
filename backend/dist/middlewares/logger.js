"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
// Rutas que llevan la cédula en la URL: no se registra el número en los logs (dato personal)
const RUTAS_CON_DOCUMENTO = /(verificar-documento|buscar-similares)\/[^/?]+/g;
function requestLogger(req, _res, next) {
    // Sin query string: los parámetros de búsqueda (nombres, apellidos) también son datos personales
    const ruta = req.originalUrl.split('?')[0].replace(RUTAS_CON_DOCUMENTO, '$1/:documento');
    console.log(`[${new Date().toISOString()}] ${req.method} ${ruta}`);
    next();
}
