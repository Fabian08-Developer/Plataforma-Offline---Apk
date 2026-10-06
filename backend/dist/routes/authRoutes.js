"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const rateLimit_1 = require("../middlewares/rateLimit");
const router = (0, express_1.Router)();
router.post('/login', rateLimit_1.limiteLoginPorIp, rateLimit_1.limiteLoginPorUsuario, authController_1.handleLogin);
exports.default = router;
