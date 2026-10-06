import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { MAX_LOTE_SYNC, processSyncBatch } from '../services/syncService';

// La ruta exige token (authenticateToken): req.user siempre existe aquí
export const handleSync = async (req: any, res: Response): Promise<void> => {
  const { encuestas } = req.body ?? {};
  if (!Array.isArray(encuestas) || encuestas.length === 0) {
    res.status(400).json({ error: 'Formato inválido o no hay encuestas para sincronizar' });
    return;
  }
  if (encuestas.length > MAX_LOTE_SYNC) {
    res.status(413).json({ error: `Lote demasiado grande. Máximo ${MAX_LOTE_SYNC} encuestas por petición.` });
    return;
  }

  try {
    const { id, usuario, nombre } = (req as AuthRequest).user!;
    const result = await processSyncBatch(encuestas, { id, usuario, nombre });
    res.json(result);
  } catch (error) {
    console.error('Error en sincronización:', error);
    res.status(500).json({ error: 'Error interno al sincronizar' });
  }
};
