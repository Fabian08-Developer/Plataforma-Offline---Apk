import { Router } from 'express';
import {
  handleVerificarDocumento,
  handleBuscarSimilares,
  handleGetMisEncuestas,
  handleDocumentosFaltantes,
} from '../controllers/surveyController';
import { authenticateToken } from '../middlewares/auth';
import { limiteBusquedas } from '../middlewares/rateLimit';

const router = Router();

// Consultas de cédulas: requieren sesión y tienen límite de frecuencia para frenar la enumeración de la base
router.post('/encuestas/documentos-faltantes', authenticateToken, limiteBusquedas, handleDocumentosFaltantes);
router.get('/encuestas/verificar-documento/:documento', authenticateToken, limiteBusquedas, handleVerificarDocumento);
router.get('/encuestas/buscar-similares/:documento', authenticateToken, limiteBusquedas, handleBuscarSimilares);
router.get('/encuestas/mis-encuestas', authenticateToken, handleGetMisEncuestas);

export default router;
