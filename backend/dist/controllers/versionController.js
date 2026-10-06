"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleGetVersionsList = exports.handleUploadVersion = exports.handleVersionInfo = exports.handleDownload = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const db_1 = require("../config/db");
const env_1 = require("../config/env");
const handleDownload = async (_req, res) => {
    try {
        const ultima = await db_1.prisma.appVersion.findFirst({ orderBy: { id: 'desc' } });
        if (!ultima) {
            res.status(404).json({ error: 'No hay versiones disponibles' });
            return;
        }
        const filename = path_1.default.basename(ultima.urlApk);
        const filePath = path_1.default.join(env_1.publicPath, 'apk', filename);
        if (fs_1.default.existsSync(filePath)) {
            res.download(filePath, `app-v${ultima.version}.apk`);
        }
        else {
            res.status(404).json({ error: 'Archivo APK no encontrado' });
        }
    }
    catch {
        res.status(500).json({ error: 'Error al descargar el APK' });
    }
};
exports.handleDownload = handleDownload;
const handleVersionInfo = async (req, res) => {
    try {
        const ultima = await db_1.prisma.appVersion.findFirst({ orderBy: { id: 'desc' } });
        if (!ultima) {
            res.json({
                version_minima: '1.0.0',
                url_descarga: '',
                descripcion: 'Sin versiones registradas',
                esObligatorio: false,
            });
            return;
        }
        const host = req.protocol + '://' + req.get('host');
        res.json({
            version_minima: ultima.version,
            url_descarga: `${host}/api/version/download`,
            descripcion: ultima.descripcion,
            esObligatorio: ultima.esObligatorio,
        });
    }
    catch {
        res.status(500).json({ error: 'Error al consultar la versión' });
    }
};
exports.handleVersionInfo = handleVersionInfo;
const FORMATO_VERSION = /^\d+(\.\d+){0,3}$/;
/** Un APK es un ZIP: los primeros 4 bytes deben ser la firma PK\x03\x04 */
function esApkValido(ruta) {
    const fd = fs_1.default.openSync(ruta, 'r');
    try {
        const cabecera = Buffer.alloc(4);
        fs_1.default.readSync(fd, cabecera, 0, 4, 0);
        return cabecera.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    }
    finally {
        fs_1.default.closeSync(fd);
    }
}
function descartarArchivo(ruta) {
    fs_1.default.unlink(ruta, () => {
        // Si ya no existe, no hay nada que hacer
    });
}
const handleUploadVersion = async (req, res) => {
    const { version, descripcion, esObligatorio } = req.body ?? {};
    if (!req.file) {
        res.status(400).json({ error: 'El archivo APK es obligatorio' });
        return;
    }
    if (typeof version !== 'string' || !FORMATO_VERSION.test(version.trim())) {
        descartarArchivo(req.file.path);
        res.status(400).json({ error: 'La versión es obligatoria y debe tener formato numérico (ej: 1.2.0)' });
        return;
    }
    if (!esApkValido(req.file.path)) {
        descartarArchivo(req.file.path);
        res.status(400).json({ error: 'El archivo no es un APK válido' });
        return;
    }
    try {
        const urlApk = `/apk/${req.file.filename}`;
        const nuevaVersion = await db_1.prisma.appVersion.create({
            data: {
                version: version.trim(),
                descripcion: typeof descripcion === 'string' ? descripcion : '',
                esObligatorio: esObligatorio === 'true' || esObligatorio === true,
                urlApk,
            },
        });
        res.json({ message: 'Versión publicada con éxito', version: nuevaVersion });
    }
    catch (error) {
        // Si no se pudo registrar, el archivo no debe quedar huérfano en la carpeta pública
        descartarArchivo(req.file.path);
        console.error('Error al subir versión:', error);
        res.status(500).json({ error: 'Error al procesar la subida' });
    }
};
exports.handleUploadVersion = handleUploadVersion;
const handleGetVersionsList = async (_req, res) => {
    try {
        const versiones = await db_1.prisma.appVersion.findMany({
            orderBy: { id: 'desc' },
        });
        res.json(versiones);
    }
    catch (error) {
        console.error('Error al listar versiones:', error);
        res.status(500).json({ error: 'Error al consultar historial de versiones' });
    }
};
exports.handleGetVersionsList = handleGetVersionsList;
