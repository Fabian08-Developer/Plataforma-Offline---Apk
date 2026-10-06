import { Router } from 'express';
import { authenticateToken, requireAdmin } from '../middlewares/auth';
import {
  handleGetEncuestadores,
  handleGetEncuestadorDetalle,
  handleCreateEncuestador,
  handleUpdateEncuestador,
  handleDeleteEncuestador,
} from '../controllers/adminUserController';
import {
  handleGetEncuestaById,
  handleCreateEncuestaAdmin,
  handleUpdateEncuesta,
  handleDeleteEncuesta,
  handleAdminStats,
} from '../controllers/adminSurveyController';
import {
  handleGetDuplicados,
  handleAprobarDuplicado,
  handleFusionarDuplicado,
  handleDescartarDuplicado,
} from '../controllers/duplicateController';
import { handleGetAvisosCedula, handleResolverAvisoCedula, handleUsarCapturaAviso } from '../controllers/avisoCedulaController';

const router = Router();

// Todas las rutas de administración requieren autenticación y rol admin
router.use(authenticateToken, requireAdmin);

// Gestión de encuestadores
router.get('/admin/encuestadores', handleGetEncuestadores);
router.get('/admin/encuestadores/:id', handleGetEncuestadorDetalle);
router.post('/admin/encuestadores', handleCreateEncuestador);
router.put('/admin/encuestadores/:id', handleUpdateEncuestador);
router.delete('/admin/encuestadores/:id', handleDeleteEncuestador);

// Gestión de encuestas
router.get('/admin/encuestas/:id', handleGetEncuestaById);
router.post('/admin/encuestas', handleCreateEncuestaAdmin);
router.put('/admin/encuestas/:id', handleUpdateEncuesta);
router.delete('/admin/encuestas/:id', handleDeleteEncuesta);

// Métricas y listados generales
router.get('/admin/stats', handleAdminStats);
router.get('/admin/encuestas', handleAdminStats);

// Auditoría y resolución de duplicados
router.get('/admin/duplicados', handleGetDuplicados);
router.post('/admin/duplicados/aprobar', handleAprobarDuplicado);
router.post('/admin/duplicados/fusionar', handleFusionarDuplicado);
router.post('/admin/duplicados/eliminar', handleDescartarDuplicado);

// Avisos de cédula repetida entre encuestadores
router.get('/admin/avisos-cedula', handleGetAvisosCedula);
router.post('/admin/avisos-cedula/:id/resolver', handleResolverAvisoCedula);
router.post('/admin/avisos-cedula/:id/usar-captura', handleUsarCapturaAviso);

export default router;
