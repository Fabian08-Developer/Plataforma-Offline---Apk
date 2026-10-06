"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const syncController_1 = require("../controllers/syncController");
const auth_1 = require("../middlewares/auth");
const router = (0, express_1.Router)();
router.post('/sync', auth_1.authenticateToken, syncController_1.handleSync);
exports.default = router;
