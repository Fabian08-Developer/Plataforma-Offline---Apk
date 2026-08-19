"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const connectionString = process.env.DATABASE_URL;
console.log('Iniciando backend con DATABASE_URL:', connectionString ? 'Configurada' : 'NO DEFINIDA');
const pool = new pg_1.Pool({ connectionString });
pool.on('error', (err) => { console.error('PostgreSQL pool error:', err); });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';
app.set('trust proxy', true);
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Logger de peticiones
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});
// Archivos estáticos — SOLO APK, nunca en raíz para no interferir con /api/
const publicPath = path_1.default.join(__dirname, '..', 'public');
if (!fs_1.default.existsSync(publicPath))
    fs_1.default.mkdirSync(publicPath, { recursive: true });
app.use('/api/apk', express_1.default.static(path_1.default.join(publicPath, 'apk')));
app.use('/apk', express_1.default.static(path_1.default.join(publicPath, 'apk')));
// Configuración de Multer para la subida de APK
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        const apkDir = path_1.default.join(publicPath, 'apk');
        if (!fs_1.default.existsSync(apkDir)) {
            fs_1.default.mkdirSync(apkDir, { recursive: true });
        }
        cb(null, apkDir);
    },
    filename: (req, file, cb) => {
        cb(null, `app-${Date.now()}.apk`);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max
});
// ── Middlewares de autenticación ──────────────────────────────────────────────
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token)
        return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    jsonwebtoken_1.default.verify(token, JWT_SECRET, (err, user) => {
        if (err)
            return res.status(403).json({ error: 'Token inválido o expirado.' });
        req.user = user;
        next();
    });
};
const requireAdmin = (req, res, next) => {
    if (req.user?.rol !== 'admin')
        return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    next();
};
// ════════════════════════════════════════════════════════════════════════════════
//  CONTROLADORES
// ════════════════════════════════════════════════════════════════════════════════
// Descarga APK
const handleDownload = async (_req, res) => {
    try {
        const ultima = await prisma.appVersion.findFirst({ orderBy: { id: 'desc' } });
        if (!ultima)
            return res.status(404).json({ error: 'No hay versiones disponibles' });
        const filename = path_1.default.basename(ultima.urlApk);
        const filePath = path_1.default.join(publicPath, 'apk', filename);
        if (fs_1.default.existsSync(filePath))
            res.download(filePath, `app-v${ultima.version}.apk`);
        else
            res.status(404).json({ error: 'Archivo APK no encontrado' });
    }
    catch {
        res.status(500).json({ error: 'Error al descargar el APK' });
    }
};
// Info de versión
const handleVersionInfo = async (req, res) => {
    try {
        const ultima = await prisma.appVersion.findFirst({ orderBy: { id: 'desc' } });
        if (!ultima)
            return res.json({ version_minima: '1.0.0', url_descarga: '', descripcion: 'Sin versiones registradas', esObligatorio: false });
        const host = req.protocol + '://' + req.get('host');
        res.json({ version_minima: ultima.version, url_descarga: `${host}/api/version/download`, descripcion: ultima.descripcion, esObligatorio: ultima.esObligatorio });
    }
    catch {
        res.status(500).json({ error: 'Error al consultar la versión' });
    }
};
// LOGIN
const handleLogin = async (req, res) => {
    const { usuario, password } = req.body;
    try {
        let user = await prisma.usuario.findUnique({ where: { usuario } });
        if (!user && usuario === 'admin') {
            const hashedPassword = await bcryptjs_1.default.hash(password || '123456', 10);
            user = await prisma.usuario.create({
                data: { nombre: 'Administrador General', usuario: 'admin', password: hashedPassword, rol: 'admin', estado: true },
            });
        }
        if (!user)
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        const validPassword = await bcryptjs_1.default.compare(password, user.password).catch(() => password === user.password);
        if (!validPassword)
            return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
        if (!user.estado)
            return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
        const token = jsonwebtoken_1.default.sign({ id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre }, JWT_SECRET, { expiresIn: '30d' });
        res.json({ token, user: { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre } });
    }
    catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
// SINCRONIZACIÓN
const handleSync = async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (authHeader) {
        const token = authHeader.split(' ')[1];
        if (token) {
            try {
                req.user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
            }
            catch { /* token expirado → continuar */ }
        }
    }
    const { encuestas, usuario } = req.body;
    if (!Array.isArray(encuestas) || encuestas.length === 0) {
        return res.status(400).json({ error: 'Formato inválido o no hay encuestas para sincronizar' });
    }
    try {
        let fallbackUser = null;
        if (usuario) {
            fallbackUser = await prisma.usuario.findUnique({ where: { usuario: String(usuario) } });
        }
        const sincronizadasIds = [];
        for (const data of encuestas) {
            if (!data.documento_identidad)
                continue;
            let targetUserId = req.user?.id;
            // 1. Si no hay token, buscar por el encuestador_usuario guardado en la encuesta
            if (!targetUserId && data.encuestador_usuario) {
                const userByUsername = await prisma.usuario.findUnique({ where: { usuario: String(data.encuestador_usuario) } });
                if (userByUsername)
                    targetUserId = userByUsername.id;
            }
            // 2. Si no, usar el usuario general que envió la petición de sincronización
            if (!targetUserId && fallbackUser) {
                targetUserId = fallbackUser.id;
            }
            // 3. Si no, verificar si data.encuestador_id existe en PostgreSQL
            if (!targetUserId && data.encuestador_id) {
                const userById = await prisma.usuario.findUnique({ where: { id: Number(data.encuestador_id) } });
                if (userById)
                    targetUserId = userById.id;
            }
            // 4. Último recurso: primer usuario administrador o primer usuario
            if (!targetUserId) {
                const defaultAdmin = await prisma.usuario.findFirst({ orderBy: { id: 'asc' } });
                targetUserId = defaultAdmin ? defaultAdmin.id : 1;
            }
            // Verificar si la encuesta ya existe por documento
            const existe = await prisma.encuesta.findFirst({
                where: { documento_identidad: String(data.documento_identidad) }
            });
            if (existe) {
                await prisma.encuesta.update({
                    where: { id: existe.id },
                    data: {
                        encuestador_id: Number(targetUserId),
                        tipo_documento: String(data.tipo_documento || existe.tipo_documento),
                        nombres: String(data.nombres || existe.nombres),
                        apellidos: String(data.apellidos || existe.apellidos),
                        telefono_1: String(data.telefono_1 || existe.telefono_1),
                        telefono_2: data.telefono_2 ? String(data.telefono_2) : existe.telefono_2,
                        telefono_3: data.telefono_3 ? String(data.telefono_3) : existe.telefono_3,
                        direccion: String(data.direccion || existe.direccion),
                        profesion: data.profesion ? String(data.profesion) : existe.profesion,
                        fecha_registro: String(data.fecha_registro || existe.fecha_registro),
                        estado_sincronizacion: 'sincronizado',
                    }
                });
                sincronizadasIds.push(data.id || existe.id);
                continue;
            }
            const nueva = await prisma.encuesta.create({
                data: {
                    encuestador_id: Number(targetUserId),
                    tipo_documento: String(data.tipo_documento || 'C.C'),
                    documento_identidad: String(data.documento_identidad),
                    nombres: String(data.nombres || ''),
                    apellidos: String(data.apellidos || ''),
                    telefono_1: String(data.telefono_1 || ''),
                    telefono_2: data.telefono_2 ? String(data.telefono_2) : '',
                    telefono_3: data.telefono_3 ? String(data.telefono_3) : '',
                    direccion: String(data.direccion || ''),
                    profesion: data.profesion ? String(data.profesion) : '',
                    fecha_registro: String(data.fecha_registro || new Date().toISOString().split('T')[0]),
                    estado_sincronizacion: 'sincronizado',
                },
            });
            sincronizadasIds.push(data.id || nueva.id);
        }
        res.json({ message: 'Sincronización exitosa', procesadas: sincronizadasIds.length, sincronizadasLocalIds: sincronizadasIds });
    }
    catch (error) {
        console.error('Error al sincronizar:', error);
        res.status(500).json({ error: `Error interno: ${error.message}` });
    }
};
// ENCUESTADOR - Obtener mis encuestas registradas en el servidor
const handleGetMisEncuestas = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Usuario no autenticado' });
        const encuestas = await prisma.encuesta.findMany({
            where: { encuestador_id: userId },
            orderBy: { id: 'desc' },
        });
        res.json(encuestas);
    }
    catch (error) {
        console.error('Error al obtener encuestas del encuestador:', error);
        res.status(500).json({ error: 'Error al consultar encuestas' });
    }
};
// ADMIN - Encuestadores
const handleGetEncuestadores = async (_req, res) => {
    try {
        const encuestadores = await prisma.usuario.findMany({
            where: { rol: 'encuestador' },
            select: { id: true, nombre: true, usuario: true, rol: true, estado: true, creado_en: true },
            orderBy: { nombre: 'asc' },
        });
        res.json(encuestadores);
    }
    catch (error) {
        console.error('Error obteniendo encuestadores:', error);
        res.status(500).json({ error: 'Error al obtener encuestadores' });
    }
};
const handleCreateEncuestador = async (req, res) => {
    try {
        const { nombre, usuario, password } = req.body;
        if (!nombre || !usuario)
            return res.status(400).json({ error: 'Nombre y usuario son obligatorios' });
        const existe = await prisma.usuario.findUnique({ where: { usuario } });
        if (existe)
            return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
        const hashedPassword = await bcryptjs_1.default.hash(password || '123456', 10);
        const nuevo = await prisma.usuario.create({ data: { nombre, usuario, password: hashedPassword, rol: 'encuestador', estado: true } });
        res.json({ message: 'Encuestador creado con éxito', usuario: nuevo });
    }
    catch (error) {
        console.error('Error creando encuestador:', error);
        res.status(500).json({ error: error.message || 'Error al crear encuestador' });
    }
};
const handleUpdateEncuestador = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { nombre, usuario, password } = req.body;
        const updateData = { nombre, usuario };
        if (password)
            updateData.password = await bcryptjs_1.default.hash(password, 10);
        const actualizado = await prisma.usuario.update({ where: { id }, data: updateData });
        res.json({ message: 'Encuestador actualizado con éxito', usuario: actualizado });
    }
    catch (error) {
        console.error('Error actualizando encuestador:', error);
        res.status(500).json({ error: error.message || 'Error al actualizar encuestador' });
    }
};
const handleDeleteEncuestador = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma.usuario.delete({ where: { id } });
        res.json({ message: 'Encuestador eliminado con éxito' });
    }
    catch (error) {
        console.error('Error eliminando encuestador:', error);
        res.status(500).json({ error: error.message || 'Error al eliminar encuestador' });
    }
};
// ADMIN - Obtener encuestador por ID y sus encuestas
const handleGetEncuestadorDetalle = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const encuestador = await prisma.usuario.findUnique({
            where: { id },
            select: { id: true, nombre: true, usuario: true, rol: true, estado: true, creado_en: true },
        });
        if (!encuestador)
            return res.status(404).json({ error: 'Encuestador no encontrado' });
        const encuestas = await prisma.encuesta.findMany({
            where: { encuestador_id: id },
            orderBy: { id: 'desc' },
        });
        res.json({ encuestador, encuestas });
    }
    catch (error) {
        console.error('Error obteniendo detalle de encuestador:', error);
        res.status(500).json({ error: 'Error al obtener detalle del encuestador' });
    }
};
// ADMIN - Obtener encuesta por ID
const handleGetEncuestaById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const encuesta = await prisma.encuesta.findUnique({
            where: { id },
            include: { encuestador: { select: { id: true, nombre: true, usuario: true } } },
        });
        if (!encuesta)
            return res.status(404).json({ error: 'Encuesta no encontrada' });
        res.json(encuesta);
    }
    catch (error) {
        console.error('Error obteniendo encuesta:', error);
        res.status(500).json({ error: 'Error al obtener encuesta' });
    }
};
// ADMIN - Actualizar encuesta por ID
const handleUpdateEncuesta = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { tipo_documento, documento_identidad, nombres, apellidos, telefono_1, telefono_2, telefono_3, direccion, profesion, fecha_registro } = req.body;
        const encuesta = await prisma.encuesta.update({
            where: { id },
            data: {
                tipo_documento: String(tipo_documento || 'C.C'),
                documento_identidad: String(documento_identidad),
                nombres: String(nombres || ''),
                apellidos: String(apellidos || ''),
                telefono_1: String(telefono_1 || ''),
                telefono_2: telefono_2 ? String(telefono_2) : '',
                telefono_3: telefono_3 ? String(telefono_3) : '',
                direccion: String(direccion || ''),
                profesion: profesion ? String(profesion) : '',
                fecha_registro: String(fecha_registro || new Date().toISOString().split('T')[0]),
            },
        });
        res.json({ message: 'Encuesta actualizada con éxito', encuesta });
    }
    catch (error) {
        console.error('Error actualizando encuesta:', error);
        res.status(500).json({ error: error.message || 'Error al actualizar encuesta' });
    }
};
// ADMIN - Eliminar encuesta por ID
const handleDeleteEncuesta = async (req, res) => {
    try {
        const id = Number(req.params.id);
        await prisma.encuesta.delete({ where: { id } });
        res.json({ message: 'Encuesta eliminada con éxito' });
    }
    catch (error) {
        console.error('Error eliminando encuesta:', error);
        res.status(500).json({ error: error.message || 'Error al eliminar encuesta' });
    }
};
const handleAdminStats = async (_req, res) => {
    try {
        const totalEncuestas = await prisma.encuesta.count();
        const totalEncuestadores = await prisma.usuario.count({ where: { rol: 'encuestador' } });
        const encuestas = await prisma.encuesta.findMany({
            orderBy: { sincronizado_en: 'desc' },
            include: { encuestador: { select: { nombre: true, usuario: true } } },
        });
        res.json({ totalEncuestas, totalEncuestadores, ultimas: encuestas.slice(0, 5), encuestas });
    }
    catch (error) {
        console.error('Error obteniendo métricas:', error);
        res.status(500).json({ error: 'Error obteniendo métricas' });
    }
};
// ════════════════════════════════════════════════════════════════════════════════
//  REGISTRO DE RUTAS (Soporta con y sin prefijo /api)
// ════════════════════════════════════════════════════════════════════════════════
app.get('/api/version/download', handleDownload);
app.get('/version/download', handleDownload);
app.get('/api/version', handleVersionInfo);
app.get('/version', handleVersionInfo);
app.post('/api/login', handleLogin);
app.post('/login', handleLogin);
app.post('/api/sync', handleSync);
app.post('/sync', handleSync);
app.get('/api/encuestas/mis-encuestas', authenticateToken, handleGetMisEncuestas);
app.get('/encuestas/mis-encuestas', authenticateToken, handleGetMisEncuestas);
app.get('/api/admin/encuestadores', authenticateToken, requireAdmin, handleGetEncuestadores);
app.get('/admin/encuestadores', authenticateToken, requireAdmin, handleGetEncuestadores);
app.get('/api/admin/encuestadores/:id', authenticateToken, requireAdmin, handleGetEncuestadorDetalle);
app.get('/admin/encuestadores/:id', authenticateToken, requireAdmin, handleGetEncuestadorDetalle);
app.post('/api/admin/encuestadores', authenticateToken, requireAdmin, handleCreateEncuestador);
app.post('/admin/encuestadores', authenticateToken, requireAdmin, handleCreateEncuestador);
app.put('/api/admin/encuestadores/:id', authenticateToken, requireAdmin, handleUpdateEncuestador);
app.put('/admin/encuestadores/:id', authenticateToken, requireAdmin, handleUpdateEncuestador);
app.delete('/api/admin/encuestadores/:id', authenticateToken, requireAdmin, handleDeleteEncuestador);
app.delete('/admin/encuestadores/:id', authenticateToken, requireAdmin, handleDeleteEncuestador);
app.get('/api/admin/encuestas/:id', authenticateToken, requireAdmin, handleGetEncuestaById);
app.get('/admin/encuestas/:id', authenticateToken, requireAdmin, handleGetEncuestaById);
app.put('/api/admin/encuestas/:id', authenticateToken, requireAdmin, handleUpdateEncuesta);
app.put('/admin/encuestas/:id', authenticateToken, requireAdmin, handleUpdateEncuesta);
app.delete('/api/admin/encuestas/:id', authenticateToken, requireAdmin, handleDeleteEncuesta);
app.delete('/admin/encuestas/:id', authenticateToken, requireAdmin, handleDeleteEncuesta);
app.get('/api/admin/stats', authenticateToken, requireAdmin, handleAdminStats);
app.get('/admin/stats', authenticateToken, requireAdmin, handleAdminStats);
app.get('/api/admin/encuestas', authenticateToken, requireAdmin, handleAdminStats);
app.get('/admin/encuestas', authenticateToken, requireAdmin, handleAdminStats);
// POST subir versión APK
app.post('/api/version', authenticateToken, requireAdmin, (req, res, next) => {
    upload.single('apkFile')(req, res, (err) => {
        if (err)
            return res.status(400).json({ error: `Error al subir el archivo: ${err.message}` });
        next();
    });
}, async (req, res) => {
    try {
        const { version, descripcion, esObligatorio } = req.body;
        if (!version || !req.file)
            return res.status(400).json({ error: 'La versión y el archivo APK son obligatorios' });
        const urlApk = `/apk/${req.file.filename}`;
        const nuevaVersion = await prisma.appVersion.create({
            data: { version, descripcion: descripcion || '', esObligatorio: esObligatorio === 'true' || esObligatorio === true, urlApk },
        });
        res.json({ message: 'Versión publicada con éxito', version: nuevaVersion });
    }
    catch (error) {
        console.error('Error al subir versión:', error);
        res.status(500).json({ error: `Error al procesar la subida: ${error.message}` });
    }
});
// ── Iniciar servidor ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});
