"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middlewares/auth");
const adminUserController_1 = require("../controllers/adminUserController");
const adminSurveyController_1 = require("../controllers/adminSurveyController");
const duplicateController_1 = require("../controllers/duplicateController");
const avisoCedulaController_1 = require("../controllers/avisoCedulaController");
const router = (0, express_1.Router)();
// Todas las rutas de administración requieren autenticación y rol admin
router.use(auth_1.authenticateToken, auth_1.requireAdmin);
// Gestión de encuestadores
router.get('/admin/encuestadores', adminUserController_1.handleGetEncuestadores);
router.get('/admin/encuestadores/:id', adminUserController_1.handleGetEncuestadorDetalle);
router.post('/admin/encuestadores', adminUserController_1.handleCreateEncuestador);
router.put('/admin/encuestadores/:id', adminUserController_1.handleUpdateEncuestador);
router.delete('/admin/encuestadores/:id', adminUserController_1.handleDeleteEncuestador);
// Gestión de encuestas
router.get('/admin/encuestas/:id', adminSurveyController_1.handleGetEncuestaById);
router.post('/admin/encuestas', adminSurveyController_1.handleCreateEncuestaAdmin);
router.put('/admin/encuestas/:id', adminSurveyController_1.handleUpdateEncuesta);
router.delete('/admin/encuestas/:id', adminSurveyController_1.handleDeleteEncuesta);
// Métricas y listados generales
router.get('/admin/stats', adminSurveyController_1.handleAdminStats);
router.get('/admin/encuestas', adminSurveyController_1.handleAdminStats);
// Auditoría y resolución de duplicados
router.get('/admin/duplicados', duplicateController_1.handleGetDuplicados);
router.post('/admin/duplicados/aprobar', duplicateController_1.handleAprobarDuplicado);
router.post('/admin/duplicados/fusionar', duplicateController_1.handleFusionarDuplicado);
router.post('/admin/duplicados/eliminar', duplicateController_1.handleDescartarDuplicado);
// Avisos de cédula repetida entre encuestadores
router.get('/admin/avisos-cedula', avisoCedulaController_1.handleGetAvisosCedula);
router.post('/admin/avisos-cedula/:id/resolver', avisoCedulaController_1.handleResolverAvisoCedula);
router.post('/admin/avisos-cedula/:id/usar-captura', avisoCedulaController_1.handleUsarCapturaAviso);
exports.default = router;
