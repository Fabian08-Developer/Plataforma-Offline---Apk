"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const surveyController_1 = require("../controllers/surveyController");
const auth_1 = require("../middlewares/auth");
const rateLimit_1 = require("../middlewares/rateLimit");
const router = (0, express_1.Router)();
// Consultas de cédulas: requieren sesión y tienen límite de frecuencia para frenar la enumeración de la base
router.post('/encuestas/documentos-faltantes', auth_1.authenticateToken, rateLimit_1.limiteBusquedas, surveyController_1.handleDocumentosFaltantes);
router.get('/encuestas/verificar-documento/:documento', auth_1.authenticateToken, rateLimit_1.limiteBusquedas, surveyController_1.handleVerificarDocumento);
router.get('/encuestas/buscar-similares/:documento', auth_1.authenticateToken, rateLimit_1.limiteBusquedas, surveyController_1.handleBuscarSimilares);
router.get('/encuestas/mis-encuestas', auth_1.authenticateToken, surveyController_1.handleGetMisEncuestas);
exports.default = router;
