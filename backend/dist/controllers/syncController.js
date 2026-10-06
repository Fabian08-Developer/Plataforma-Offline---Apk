"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSync = void 0;
const syncService_1 = require("../services/syncService");
// La ruta exige token (authenticateToken): req.user siempre existe aquí
const handleSync = async (req, res) => {
    const { encuestas } = req.body ?? {};
    if (!Array.isArray(encuestas) || encuestas.length === 0) {
        res.status(400).json({ error: 'Formato inválido o no hay encuestas para sincronizar' });
        return;
    }
    if (encuestas.length > syncService_1.MAX_LOTE_SYNC) {
        res.status(413).json({ error: `Lote demasiado grande. Máximo ${syncService_1.MAX_LOTE_SYNC} encuestas por petición.` });
        return;
    }
    try {
        const { id, usuario, nombre } = req.user;
        const result = await (0, syncService_1.processSyncBatch)(encuestas, { id, usuario, nombre });
        res.json(result);
    }
    catch (error) {
        console.error('Error en sincronización:', error);
        res.status(500).json({ error: 'Error interno al sincronizar' });
    }
};
exports.handleSync = handleSync;
