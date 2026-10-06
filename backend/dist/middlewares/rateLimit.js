"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.limiteBusquedas = exports.limiteLoginPorUsuario = exports.limiteLoginPorIp = void 0;
exports.limitarPeticiones = limitarPeticiones;
/**
 * Límite de peticiones en memoria (ventana fija).
 * Nota: el contador vive en el proceso. Si la API se ejecuta con varios procesos (cluster / PM2 en modo cluster),
 * cada proceso lleva su propio conteo.
 */
function limitarPeticiones({ ventanaMs, maximo, clave, mensaje }) {
    const contadores = new Map();
    // Limpieza periódica para que el mapa no crezca sin límite
    const limpieza = setInterval(() => {
        const ahora = Date.now();
        for (const [k, v] of contadores) {
            if (ahora - v.inicio >= ventanaMs)
                contadores.delete(k);
        }
    }, ventanaMs);
    limpieza.unref();
    return (req, res, next) => {
        const ahora = Date.now();
        const k = clave(req);
        let contador = contadores.get(k);
        if (!contador || ahora - contador.inicio >= ventanaMs) {
            contador = { inicio: ahora, total: 0 };
            contadores.set(k, contador);
        }
        contador.total++;
        if (contador.total > maximo) {
            const segundos = Math.ceil((contador.inicio + ventanaMs - ahora) / 1000);
            res.setHeader('Retry-After', String(segundos));
            res.status(429).json({ error: mensaje });
            return;
        }
        next();
    };
}
const QUINCE_MINUTOS = 15 * 60 * 1000;
/** Login: límite por IP (frena ataques desde una misma máquina) */
exports.limiteLoginPorIp = limitarPeticiones({
    ventanaMs: QUINCE_MINUTOS,
    maximo: 50,
    clave: (req) => `ip:${req.ip}`,
    mensaje: 'Demasiados intentos de inicio de sesión. Intente más tarde.',
});
/** Login: límite por usuario (frena ataques dirigidos desde muchas IP) */
exports.limiteLoginPorUsuario = limitarPeticiones({
    ventanaMs: QUINCE_MINUTOS,
    maximo: 10,
    clave: (req) => `usuario:${String(req.body?.usuario ?? '').toLowerCase()}`,
    mensaje: 'Demasiados intentos para este usuario. Intente más tarde.',
});
/** Búsquedas de cédulas: evita que una cuenta enumere la base de datos */
exports.limiteBusquedas = limitarPeticiones({
    ventanaMs: 60 * 1000,
    maximo: 120,
    clave: (req) => `user:${req.user?.id ?? req.ip}`,
    mensaje: 'Demasiadas búsquedas en poco tiempo. Espere un momento.',
});
