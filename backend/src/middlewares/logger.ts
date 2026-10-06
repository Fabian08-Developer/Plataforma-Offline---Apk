import { Request, Response, NextFunction } from 'express';

// Rutas que llevan la cédula en la URL: no se registra el número en los logs (dato personal)
const RUTAS_CON_DOCUMENTO = /(verificar-documento|buscar-similares)\/[^/?]+/g;

export function requestLogger(req: Request, _res: Response, next: NextFunction): void {
  // Sin query string: los parámetros de búsqueda (nombres, apellidos) también son datos personales
  const ruta = req.originalUrl.split('?')[0].replace(RUTAS_CON_DOCUMENTO, '$1/:documento');
  console.log(`[${new Date().toISOString()}] ${req.method} ${ruta}`);
  next();
}
