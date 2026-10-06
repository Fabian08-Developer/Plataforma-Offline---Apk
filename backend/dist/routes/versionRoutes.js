"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const versionController_1 = require("../controllers/versionController");
const auth_1 = require("../middlewares/auth");
const multer_1 = require("../config/multer");
const router = (0, express_1.Router)();
router.get('/version/download', versionController_1.handleDownload);
router.get('/version', versionController_1.handleVersionInfo);
router.get('/version/list', versionController_1.handleGetVersionsList);
router.post('/version', auth_1.authenticateToken, auth_1.requireAdmin, (req, res, next) => {
    multer_1.upload.single('apkFile')(req, res, (err) => {
        if (err) {
            res.status(400).json({ error: `Error al subir el archivo: ${err.message}` });
            return;
        }
        next();
    });
}, versionController_1.handleUploadVersion);
exports.default = router;
