import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
console.log('Iniciando backend con DATABASE_URL:', connectionString ? 'Configurada' : 'NO DEFINIDA');
const pool = new Pool({ connectionString });
pool.on('error', (err) => { console.error('PostgreSQL pool error:', err); });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 3005;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Logger de peticiones
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Archivos estáticos — SOLO APK, nunca en raíz para no interferir con /api/
const publicPath = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });
app.use('/api/apk', express.static(path.join(publicPath, 'apk')));
app.use('/apk',     express.static(path.join(publicPath, 'apk')));

// Configuración de Multer para la subida de APK
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const apkDir = path.join(publicPath, 'apk');
    if (!fs.existsSync(apkDir)) {
      fs.mkdirSync(apkDir, { recursive: true });
    }
    cb(null, apkDir);
  },
  filename: (req, file, cb) => {
    cb(null, `app-${Date.now()}.apk`);
  }
});
const upload = multer({ 
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100 MB max
});

// ── Middlewares de autenticación ──────────────────────────────────────────────
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
    req.user = user;
    next();
  });
};

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.rol !== 'admin') return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
  next();
};

// ════════════════════════════════════════════════════════════════════════════════
//  CONTROLADORES
// ════════════════════════════════════════════════════════════════════════════════

// Descarga APK
const handleDownload = async (_req: express.Request, res: express.Response) => {
  try {
    const ultima = await prisma.appVersion.findFirst({ orderBy: { id: 'desc' } });
    if (!ultima) return res.status(404).json({ error: 'No hay versiones disponibles' });
    const filename = path.basename(ultima.urlApk);
    const filePath = path.join(publicPath, 'apk', filename);
    if (fs.existsSync(filePath)) res.download(filePath, `app-v${ultima.version}.apk`);
    else res.status(404).json({ error: 'Archivo APK no encontrado' });
  } catch { res.status(500).json({ error: 'Error al descargar el APK' }); }
};

// Info de versión
const handleVersionInfo = async (req: express.Request, res: express.Response) => {
  try {
    const ultima = await prisma.appVersion.findFirst({ orderBy: { id: 'desc' } });
    if (!ultima) return res.json({ version_minima: '1.0.0', url_descarga: '', descripcion: 'Sin versiones registradas', esObligatorio: false });
    const host = req.protocol + '://' + req.get('host');
    res.json({ version_minima: ultima.version, url_descarga: `${host}/api/version/download`, descripcion: ultima.descripcion, esObligatorio: ultima.esObligatorio });
  } catch { res.status(500).json({ error: 'Error al consultar la versión' }); }
};

// LOGIN
const handleLogin = async (req: express.Request, res: express.Response) => {
  const { usuario, password } = req.body;
  try {
    let user = await prisma.usuario.findUnique({ where: { usuario } });
    if (!user && usuario === 'admin') {
      const hashedPassword = await bcrypt.hash(password || '123456', 10);
      user = await prisma.usuario.create({
        data: { nombre: 'Administrador General', usuario: 'admin', password: hashedPassword, rol: 'admin', estado: true },
      });
    }
    if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    const validPassword = await bcrypt.compare(password, user.password).catch(() => password === user!.password);
    if (!validPassword) return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    if (!user.estado) return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre },
      JWT_SECRET, { expiresIn: '30d' }
    );
    res.json({ token, user: { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre } });
  } catch (error: any) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// SINCRONIZACIÓN
const handleSync = async (req: any, res: express.Response) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* token expirado → continuar */ }
    }
  }
  const { encuestas, usuario } = req.body;
  if (!Array.isArray(encuestas) || encuestas.length === 0) {
    return res.status(400).json({ error: 'Formato inválido o no hay encuestas para sincronizar' });
  }

  let fallbackUser = null;
  if (usuario) {
    fallbackUser = await prisma.usuario.findUnique({ where: { usuario: String(usuario) } }).catch(() => null);
  }

  /**
   * Resuelve el ID de usuario válido para esta encuesta.
   * Orden de prioridad: token JWT → encuestador_usuario → encuestador_id del dispositivo → fallbackUser → primer admin
   * IMPORTANTE: el encuestador_id que llega del dispositivo es el ID local de SQLite, que NO
   * coincide con el ID de PostgreSQL. Por eso lo validamos antes de usarlo.
   */
  const resolveTargetUserId = async (data: any): Promise<number> => {
    // 1. ID del token JWT autenticado (más confiable)
    if (req.user?.id) {
      const userByToken = await prisma.usuario.findUnique({ where: { id: Number(req.user.id) } }).catch(() => null);
      if (userByToken) return userByToken.id;
    }
    // 2. Username guardado en la encuesta
    if (data.encuestador_usuario) {
      const userByUsername = await prisma.usuario.findUnique({ where: { usuario: String(data.encuestador_usuario) } }).catch(() => null);
      if (userByUsername) return userByUsername.id;
    }
    // 3. Usuario general que envió la petición de sincronización
    if (fallbackUser) return fallbackUser.id;
    // 4. encuestador_id local del dispositivo (validado contra PostgreSQL)
    if (data.encuestador_id) {
      const userById = await prisma.usuario.findUnique({ where: { id: Number(data.encuestador_id) } }).catch(() => null);
      if (userById) return userById.id;
    }
    // 5. Último recurso: primer usuario del sistema
    const defaultAdmin = await prisma.usuario.findFirst({ orderBy: { id: 'asc' } }).catch(() => null);
    return defaultAdmin ? defaultAdmin.id : 1;
  };

  const sincronizadasIds: Array<{ localId: any; documento_identidad: string }> = [];
  const errores: Array<{ documento_identidad: string; error: string }> = [];

  for (const data of encuestas) {
    if (!data.documento_identidad) continue;

    try {
      const targetUserId = await resolveTargetUserId(data);
      const docIdentidad = String(data.documento_identidad).trim();

      /**
       * Upsert atómico con transaction SERIALIZABLE.
       * Previene que dos dispositivos que sincronizan el mismo documento_identidad
       * simultáneamente generen un duplicado en PostgreSQL.
       * Con isolationLevel Serializable, si Tx2 ve que Tx1 ya insertó el mismo registro,
       * PostgreSQL cancela Tx2 con un error de serialización en lugar de dejar pasar el CREATE.
       */
      const resultado = await prisma.$transaction(async (tx) => {
        const existe = await tx.encuesta.findFirst({
          where: { documento_identidad: docIdentidad }
        });

        if (existe) {
          // ACTUALIZAR — pero PRESERVAR el encuestador_id original para no
          // quitarle la encuesta al encuestador que la creó originalmente.
          return await tx.encuesta.update({
            where: { id: existe.id },
            data: {
              encuestador_id: existe.encuestador_id || Number(targetUserId),
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
        }

        // CREAR nueva encuesta
        return await tx.encuesta.create({
          data: {
            encuestador_id: Number(targetUserId),
            tipo_documento: String(data.tipo_documento || 'C.C'),
            documento_identidad: docIdentidad,
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
      }, {
        isolationLevel: 'Serializable',
        maxWait: 5000,  // espera máx. 5s para adquirir la tx
        timeout:  10000 // timeout máx. 10s para completarla
      });

      sincronizadasIds.push({ localId: data.id ?? resultado.id, documento_identidad: docIdentidad });

    } catch (encuestaError: any) {
      // Error individual: loguear pero NO interrumpir el resto del lote
      console.error(`Error sincronizando encuesta con documento ${data.documento_identidad}:`, encuestaError.message);
      errores.push({ documento_identidad: String(data.documento_identidad), error: encuestaError.message });
    }
  }

  res.json({
    message: errores.length === 0 ? 'Sincronización exitosa' : 'Sincronización parcial',
    procesadas: sincronizadasIds.length,
    errores: errores.length,
    // Compatibilidad hacia atrás: array plano de IDs locales
    sincronizadasLocalIds: sincronizadasIds.map(s => s.localId),
    // Nuevo: array con id + documento_identidad para marcar correctamente en SQLite
    sincronizadas: sincronizadasIds,
  });
};

// ENCUESTADOR - Verificar si un documento ya está registrado en el servidor (cualquier encuestador)
// Usado por el APK para detectar duplicados ANTES de guardar una nueva encuesta offline.
const handleVerificarDocumento = async (req: any, res: express.Response) => {
  try {
    const doc = String(req.params.documento || '').trim();
    if (doc.length < 5) return res.status(400).json({ error: 'Documento demasiado corto' });

    const encuesta = await prisma.encuesta.findFirst({
      where: { documento_identidad: doc },
    });

    if (!encuesta) return res.status(404).json(null);
    res.json(encuesta);
  } catch (error) {
    console.error('Error verificando documento:', error);
    res.status(500).json({ error: 'Error al verificar documento' });
  }
};

const handleGetMisEncuestas = async (req: any, res: express.Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Usuario no autenticado' });

    const encuestas = await prisma.encuesta.findMany({
      where: { encuestador_id: userId },
      orderBy: { id: 'desc' },
    });

    res.json(encuestas);
  } catch (error: any) {
    console.error('Error al obtener encuestas del encuestador:', error);
    res.status(500).json({ error: 'Error al consultar encuestas' });
  }
};

// ADMIN - Encuestadores
const handleGetEncuestadores = async (_req: express.Request, res: express.Response) => {
  try {
    const encuestadores = await prisma.usuario.findMany({
      where: { rol: 'encuestador' },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true, creado_en: true },
      orderBy: { nombre: 'asc' },
    });
    res.json(encuestadores);
  } catch (error) {
    console.error('Error obteniendo encuestadores:', error);
    res.status(500).json({ error: 'Error al obtener encuestadores' });
  }
};

const handleCreateEncuestador = async (req: express.Request, res: express.Response) => {
  try {
    const { nombre, usuario, password } = req.body;
    if (!nombre || !usuario) return res.status(400).json({ error: 'Nombre y usuario son obligatorios' });
    const existe = await prisma.usuario.findUnique({ where: { usuario } });
    if (existe) return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    const hashedPassword = await bcrypt.hash(password || '123456', 10);
    const nuevo = await prisma.usuario.create({ data: { nombre, usuario, password: hashedPassword, rol: 'encuestador', estado: true } });
    res.json({ message: 'Encuestador creado con éxito', usuario: nuevo });
  } catch (error: any) {
    console.error('Error creando encuestador:', error);
    res.status(500).json({ error: error.message || 'Error al crear encuestador' });
  }
};

const handleUpdateEncuestador = async (req: express.Request, res: express.Response) => {
  try {
    const id = Number(req.params.id);
    const { nombre, usuario, password } = req.body;
    const updateData: any = { nombre, usuario };
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const actualizado = await prisma.usuario.update({ where: { id }, data: updateData });
    res.json({ message: 'Encuestador actualizado con éxito', usuario: actualizado });
  } catch (error: any) {
    console.error('Error actualizando encuestador:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar encuestador' });
  }
};

const handleDeleteEncuestador = async (req: any, res: express.Response) => {
  try {
    const id = Number(req.params.id);
    const { adminPassword } = req.body || {};

    const encuestador = await prisma.usuario.findUnique({ where: { id } });
    if (!encuestador) return res.status(404).json({ error: 'Encuestador no encontrado' });

    const totalEncuestas = await prisma.encuesta.count({ where: { encuestador_id: id } });

    if (totalEncuestas > 0) {
      if (!adminPassword) {
        return res.status(400).json({
          requiresPassword: true,
          totalEncuestas,
          error: `Este encuestador tiene ${totalEncuestas} encuestas registradas. Ingrese su contraseña de administrador para confirmar la eliminación.`,
        });
      }

      // Validar la contraseña del administrador actual
      const adminUserId = req.user?.id;
      const adminUser = await prisma.usuario.findUnique({ where: { id: adminUserId } });
      if (!adminUser) return res.status(401).json({ error: 'Administrador no autenticado' });

      const validPassword = await bcrypt.compare(adminPassword, adminUser.password).catch(() => adminPassword === adminUser.password);
      if (!validPassword) {
        return res.status(403).json({ error: 'Contraseña de administrador incorrecta' });
      }

      // Eliminar en cascada todas las encuestas realizadas por este encuestador
      await prisma.encuesta.deleteMany({
        where: { encuestador_id: id },
      });
    }

    await prisma.usuario.delete({ where: { id } });
    res.json({ message: 'Encuestador y todas sus encuestas eliminados con éxito', encuestasEliminadas: totalEncuestas });
  } catch (error: any) {
    console.error('Error eliminando encuestador:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar encuestador' });
  }
};

// ADMIN - Obtener encuestador por ID y sus encuestas
const handleGetEncuestadorDetalle = async (req: express.Request, res: express.Response) => {
  try {
    const id = Number(req.params.id);
    const encuestador = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true, creado_en: true },
    });
    if (!encuestador) return res.status(404).json({ error: 'Encuestador no encontrado' });

    const encuestas = await prisma.encuesta.findMany({
      where: { encuestador_id: id },
      orderBy: { id: 'desc' },
    });

    res.json({ encuestador, encuestas });
  } catch (error) {
    console.error('Error obteniendo detalle de encuestador:', error);
    res.status(500).json({ error: 'Error al obtener detalle del encuestador' });
  }
};

// ADMIN - Obtener encuesta por ID
const handleGetEncuestaById = async (req: express.Request, res: express.Response) => {
  try {
    const id = Number(req.params.id);
    const encuesta = await prisma.encuesta.findUnique({
      where: { id },
      include: { encuestador: { select: { id: true, nombre: true, usuario: true } } },
    });
    if (!encuesta) return res.status(404).json({ error: 'Encuesta no encontrada' });
    res.json(encuesta);
  } catch (error) {
    console.error('Error obteniendo encuesta:', error);
    res.status(500).json({ error: 'Error al obtener encuesta' });
  }
};

// ADMIN - Actualizar encuesta por ID
const handleUpdateEncuesta = async (req: express.Request, res: express.Response) => {
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
  } catch (error: any) {
    console.error('Error actualizando encuesta:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar encuesta' });
  }
};

// ADMIN - Eliminar encuesta por ID
const handleDeleteEncuesta = async (req: express.Request, res: express.Response) => {
  try {
    const id = Number(req.params.id);
    await prisma.encuesta.delete({ where: { id } });
    res.json({ message: 'Encuesta eliminada con éxito' });
  } catch (error: any) {
    console.error('Error eliminando encuesta:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar encuesta' });
  }
};

// ADMIN - Crear encuesta directamente
const handleCreateEncuestaAdmin = async (req: any, res: express.Response) => {
  try {
    const {
      encuestador_id,
      tipo_documento,
      documento_identidad,
      nombres,
      apellidos,
      telefono_1,
      telefono_2,
      telefono_3,
      direccion,
      profesion,
      fecha_registro,
    } = req.body;

    if (!documento_identidad) {
      return res.status(400).json({ error: 'El documento de identidad es obligatorio' });
    }

    let targetUserId = encuestador_id || req.user?.id;
    if (targetUserId) {
      const userExists = await prisma.usuario.findUnique({ where: { id: Number(targetUserId) } });
      if (!userExists) targetUserId = req.user.id;
    } else {
      targetUserId = req.user.id;
    }

    const existe = await prisma.encuesta.findFirst({
      where: { documento_identidad: String(documento_identidad) },
    });

    if (existe) {
      const actualizada = await prisma.encuesta.update({
        where: { id: existe.id },
        data: {
          encuestador_id: Number(targetUserId),
          tipo_documento: String(tipo_documento || existe.tipo_documento),
          nombres: String(nombres || existe.nombres),
          apellidos: String(apellidos || existe.apellidos),
          telefono_1: String(telefono_1 || existe.telefono_1),
          telefono_2: telefono_2 ? String(telefono_2) : existe.telefono_2,
          telefono_3: telefono_3 ? String(telefono_3) : existe.telefono_3,
          direccion: String(direccion || existe.direccion),
          profesion: profesion ? String(profesion) : existe.profesion,
          fecha_registro: String(fecha_registro || existe.fecha_registro),
          estado_sincronizacion: 'sincronizado',
        },
        include: { encuestador: { select: { id: true, nombre: true, usuario: true } } },
      });
      return res.json({ message: 'Encuesta actualizada con éxito', encuesta: actualizada });
    }

    const nueva = await prisma.encuesta.create({
      data: {
        encuestador_id: Number(targetUserId),
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
        estado_sincronizacion: 'sincronizado',
      },
      include: { encuestador: { select: { id: true, nombre: true, usuario: true } } },
    });
    res.json({ message: 'Encuesta creada con éxito', encuesta: nueva });
  } catch (error: any) {
    console.error('Error creando encuesta admin:', error);
    res.status(500).json({ error: error.message || 'Error al crear encuesta' });
  }
};

const handleAdminStats = async (_req: express.Request, res: express.Response) => {
  try {
    const totalEncuestas = await prisma.encuesta.count();
    const totalEncuestadores = await prisma.usuario.count({ where: { rol: 'encuestador' } });
    const encuestas = await prisma.encuesta.findMany({
      orderBy: { sincronizado_en: 'desc' },
      include: { encuestador: { select: { id: true, nombre: true, usuario: true } } },
    });
    res.json({ totalEncuestas, totalEncuestadores, ultimas: encuestas.slice(0, 5), encuestas });
  } catch (error) {
    console.error('Error obteniendo métricas:', error);
    res.status(500).json({ error: 'Error obteniendo métricas' });
  }
};

// ════════════════════════════════════════════════════════════════════════════════
//  REGISTRO DE RUTAS (Soporta con y sin prefijo /api)
// ════════════════════════════════════════════════════════════════════════════════

app.get('/api/version/download', handleDownload);
app.get('/version/download',     handleDownload);

app.get('/api/version', handleVersionInfo);
app.get('/version',     handleVersionInfo);

app.post('/api/login', handleLogin);
app.post('/login',     handleLogin);

app.post('/api/sync', handleSync);
app.post('/sync',     handleSync);

app.get('/api/encuestas/verificar-documento/:documento', authenticateToken, handleVerificarDocumento);
app.get('/encuestas/verificar-documento/:documento',     authenticateToken, handleVerificarDocumento);

app.get('/api/encuestas/mis-encuestas', authenticateToken, handleGetMisEncuestas);
app.get('/encuestas/mis-encuestas',     authenticateToken, handleGetMisEncuestas);


app.get('/api/admin/encuestadores', authenticateToken, requireAdmin, handleGetEncuestadores);
app.get('/admin/encuestadores',     authenticateToken, requireAdmin, handleGetEncuestadores);

app.get('/api/admin/encuestadores/:id', authenticateToken, requireAdmin, handleGetEncuestadorDetalle);
app.get('/admin/encuestadores/:id',     authenticateToken, requireAdmin, handleGetEncuestadorDetalle);

app.post('/api/admin/encuestadores', authenticateToken, requireAdmin, handleCreateEncuestador);
app.post('/admin/encuestadores',     authenticateToken, requireAdmin, handleCreateEncuestador);

app.put('/api/admin/encuestadores/:id', authenticateToken, requireAdmin, handleUpdateEncuestador);
app.put('/admin/encuestadores/:id',     authenticateToken, requireAdmin, handleUpdateEncuestador);

app.delete('/api/admin/encuestadores/:id', authenticateToken, requireAdmin, handleDeleteEncuestador);
app.delete('/admin/encuestadores/:id',     authenticateToken, requireAdmin, handleDeleteEncuestador);

app.get('/api/admin/encuestas/:id', authenticateToken, requireAdmin, handleGetEncuestaById);
app.get('/admin/encuestas/:id',     authenticateToken, requireAdmin, handleGetEncuestaById);

app.post('/api/admin/encuestas', authenticateToken, requireAdmin, handleCreateEncuestaAdmin);
app.post('/admin/encuestas',     authenticateToken, requireAdmin, handleCreateEncuestaAdmin);

app.put('/api/admin/encuestas/:id', authenticateToken, requireAdmin, handleUpdateEncuesta);
app.put('/admin/encuestas/:id',     authenticateToken, requireAdmin, handleUpdateEncuesta);

app.delete('/api/admin/encuestas/:id', authenticateToken, requireAdmin, handleDeleteEncuesta);
app.delete('/admin/encuestas/:id',     authenticateToken, requireAdmin, handleDeleteEncuesta);

app.get('/api/admin/stats', authenticateToken, requireAdmin, handleAdminStats);
app.get('/admin/stats',     authenticateToken, requireAdmin, handleAdminStats);

app.get('/api/admin/encuestas', authenticateToken, requireAdmin, handleAdminStats);
app.get('/admin/encuestas',     authenticateToken, requireAdmin, handleAdminStats);

// POST subir versión APK
app.post('/api/version', authenticateToken, requireAdmin, (req: any, res: any, next: any) => {
  upload.single('apkFile')(req, res, (err: any) => {
    if (err) return res.status(400).json({ error: `Error al subir el archivo: ${err.message}` });
    next();
  });
}, async (req: any, res: express.Response) => {
  try {
    const { version, descripcion, esObligatorio } = req.body;
    if (!version || !req.file) return res.status(400).json({ error: 'La versión y el archivo APK son obligatorios' });
    const urlApk = `/apk/${req.file.filename}`;
    const nuevaVersion = await prisma.appVersion.create({
      data: { version, descripcion: descripcion || '', esObligatorio: esObligatorio === 'true' || esObligatorio === true, urlApk },
    });
    res.json({ message: 'Versión publicada con éxito', version: nuevaVersion });
  } catch (error: any) {
    console.error('Error al subir versión:', error);
    res.status(500).json({ error: `Error al procesar la subida: ${error.message}` });
  }
});

// ── Iniciar servidor ───────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});
