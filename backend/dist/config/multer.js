"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.upload = void 0;
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const env_1 = require("./env");
const storage = multer_1.default.diskStorage({
    destination: (_req, _file, cb) => {
        if (!fs_1.default.existsSync(env_1.apkDir)) {
            fs_1.default.mkdirSync(env_1.apkDir, { recursive: true });
        }
        cb(null, env_1.apkDir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `app-${Date.now()}.apk`);
    },
});
exports.upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
    fileFilter: (_req, file, cb) => {
        // Primer filtro por nombre; la validación real del contenido se hace después (ver esApkValido)
        if (!file.originalname.toLowerCase().endsWith('.apk')) {
            cb(new Error('Solo se permiten archivos .apk'));
            return;
        }
        cb(null, true);
    },
});
