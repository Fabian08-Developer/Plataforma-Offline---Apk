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
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'tu_secreto_super_seguro_cambiar_en_produccion';

app.set('trust proxy', true);
app.use(cors());
app.use(express.json());

// Servir la carpeta public estáticamente (tanto en /, /apk, /api/apk como /api/public)
const publicPath = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicPath)) {
  fs.mkdirSync(publicPath, { recursive: true });
}
app.use(express.static(publicPath));
app.use('/api/apk', express.static(path.join(publicPath, 'apk')));
app.use('/apk', express.static(path.join(publicPath, 'apk')));
app.use('/api/public', express.static(publicPath));

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

// --- Auth Middleware ---
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

// --- Rutas Públicas ---

// Ruta de descarga directa del APK más reciente (Soporta /api/version/download y /version/download)
const handleDownload = async (req: express.Request, res: express.Response) => {
  try {
    const ultimaVersion = await prisma.appVersion.findFirst({
      orderBy: { id: 'desc' }
    });
    
    if (!ultimaVersion) {
      return res.status(404).json({ error: 'No hay versiones disponibles' });
    }

    const filename = path.basename(ultimaVersion.urlApk);
    const filePath = path.join(publicPath, 'apk', filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath, `app-v${ultimaVersion.version}.apk`);
    } else {
      res.status(404).json({ error: 'Archivo APK no encontrado en el servidor' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error al descargar el APK' });
  }
};

app.get(['/api/version/download', '/version/download'], handleDownload);

const handleVersionInfo = async (req: express.Request, res: express.Response) => {
  try {
    const ultimaVersion = await prisma.appVersion.findFirst({
      orderBy: { id: 'desc' }
    });
    
    if (!ultimaVersion) {
      return res.json({ 
        version_minima: '1.0.0', 
        url_descarga: '', 
        descripcion: 'Sin versiones registradas', 
        esObligatorio: false 
      });
    }

    const host = req.protocol + '://' + req.get('host');
    const downloadUrl = `${host}/api/version/download`;

    res.json({ 
      version_minima: ultimaVersion.version, 
      url_descarga: downloadUrl,
      descripcion: ultimaVersion.descripcion,
      esObligatorio: ultimaVersion.esObligatorio
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al consultar la versión' });
  }
};

app.get(['/api/version', '/version'], handleVersionInfo);

app.post(['/api/login', '/login'], async (req: any, res: any) => {
  const { usuario, password } = req.body;

  try {
    let user = await prisma.usuario.findUnique({ where: { usuario } });
    
    // Si no existe el usuario admin por defecto en PostgreSQL, lo creamos automáticamente
    if (!user && usuario === 'admin') {
      const hashedPassword = await bcrypt.hash(password || '123456', 10);
      user = await prisma.usuario.create({
        data: {
          nombre: 'Administrador General',
          usuario: 'admin',
          password: hashedPassword,
          rol: 'admin',
          estado: true
        }
      });
    }

    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    let validPassword = await bcrypt.compare(password, user.password).catch(() => false);
    if (!validPassword && password === user.password) {
      validPassword = true;
    }

    if (!validPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    if (!user.estado) {
      return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    }

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre }, 
      JWT_SECRET, 
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre } });
  } catch (error) {
    console.error('Error en login backend:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- Rutas Protegidas y Sincronización ---

const handleSync = async (req: any, res: any) => {
  const { encuestas } = req.body;
  let rawEncuestadorId = req.user?.id || req.body.encuestador_id || null;

  if (!Array.isArray(encuestas) || encuestas.length === 0) {
    return res.status(400).json({ error: 'Formato inválido o no hay encuestas para sincronizar' });
  }

  try {
    const encuestasProcesadasIds = [];

    // Buscar o crear primer usuario de respaldo (por si encuestador_id local no existe en el VPS)
    let usuarioRespaldo = await prisma.usuario.findFirst({ orderBy: { id: 'asc' } });
    if (!usuarioRespaldo) {
      const defaultPass = await bcrypt.hash('123456', 10);
      usuarioRespaldo = await prisma.usuario.create({
        data: {
          nombre: 'Administrador General',
          usuario: 'admin',
          password: defaultPass,
          rol: 'admin',
          estado: true
        }
      });
    }
    const defaultUserId = usuarioRespaldo.id;

    for (const data of encuestas) {
      if (!data.documento_identidad) continue;

      // Buscar si la encuesta ya fue sincronizada previamente
      const existe = await prisma.encuesta.findFirst({
        where: { documento_identidad: String(data.documento_identidad) }
      });

      if (!existe) {
        // Validar que el encuestador_id exista en la tabla Usuario de PostgreSQL
        let targetUserId = rawEncuestadorId || data.encuestador_id;
        if (targetUserId) {
          const userExists = await prisma.usuario.findUnique({ where: { id: Number(targetUserId) } });
          if (!userExists) {
            targetUserId = defaultUserId;
          }
        } else {
          targetUserId = defaultUserId;
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
          }
        });
        encuestasProcesadasIds.push(data.id || nueva.id);
      } else {
        // Si ya existía en la nube, marcamos como procesado el ID local
        encuestasProcesadasIds.push(data.id);
      }
    }

    res.json({ 
      message: 'Sincronización exitosa', 
      procesadas: encuestasProcesadasIds.length,
      sincronizadasLocalIds: encuestasProcesadasIds 
    });
  } catch (error: any) {
    console.error('Error al sincronizar encuestas:', error);
    res.status(500).json({ error: `Error interno del servidor al procesar las encuestas: ${error.message}` });
  }
};

// Sincronización acepta petición autenticada o directa desde dispositivos encuestadores sin bloquear si el token expiró
app.post(['/api/sync', '/sync'], (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    const token = authHeader.split(' ')[1];
    if (token) {
      jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
        if (!err && user) {
          req.user = user;
        }
        next();
      });
      return;
    }
  }
  next();
}, handleSync);

// --- Rutas de Administrador ---
const requireAdmin = (req: any, res: any, next: any) => {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
  }
  next();
};

// CRUD de Encuestadores en PostgreSQL
app.get(['/api/admin/encuestadores', '/admin/encuestadores'], authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const encuestadores = await prisma.usuario.findMany({
      where: { rol: 'encuestador' },
      select: { id: true, nombre: true, usuario: true, rol: true, estado: true, creado_en: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(encuestadores);
  } catch (error) {
    console.error('Error obteniendo encuestadores:', error);
    res.status(500).json({ error: 'Error al obtener encuestadores' });
  }
});

app.post(['/api/admin/encuestadores', '/admin/encuestadores'], authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const { nombre, usuario, password } = req.body;
    if (!nombre || !usuario) {
      return res.status(400).json({ error: 'Nombre y usuario son obligatorios' });
    }
    const existe = await prisma.usuario.findUnique({ where: { usuario } });
    if (existe) {
      return res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
    }
    const hashedPassword = await bcrypt.hash(password || '123456', 10);
    const nuevo = await prisma.usuario.create({
      data: {
        nombre,
        usuario,
        password: hashedPassword,
        rol: 'encuestador',
        estado: true
      }
    });
    res.json({ message: 'Encuestador creado con éxito', usuario: nuevo });
  } catch (error: any) {
    console.error('Error creando encuestador:', error);
    res.status(500).json({ error: error.message || 'Error al crear encuestador' });
  }
});

app.put(['/api/admin/encuestadores/:id', '/admin/encuestadores/:id'], authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    const { nombre, usuario, password } = req.body;
    const updateData: any = { nombre, usuario };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const actualizado = await prisma.usuario.update({
      where: { id },
      data: updateData
    });
    res.json({ message: 'Encuestador actualizado con éxito', usuario: actualizado });
  } catch (error: any) {
    console.error('Error actualizando encuestador:', error);
    res.status(500).json({ error: error.message || 'Error al actualizar encuestador' });
  }
});

app.delete(['/api/admin/encuestadores/:id', '/admin/encuestadores/:id'], authenticateToken, requireAdmin, async (req: any, res: any) => {
  try {
    const id = Number(req.params.id);
    await prisma.usuario.delete({ where: { id } });
    res.json({ message: 'Encuestador eliminado con éxito' });
  } catch (error: any) {
    console.error('Error eliminando encuestador:', error);
    res.status(500).json({ error: error.message || 'Error al eliminar encuestador' });
  }
});

const handleAdminStats = async (req: any, res: any) => {
  try {
    const totalEncuestas = await prisma.encuesta.count();
    const totalEncuestadores = await prisma.usuario.count({ where: { rol: 'encuestador' } });
    
    // Obtener todas las encuestas centralizadas
    const encuestas = await prisma.encuesta.findMany({
      orderBy: { sincronizado_en: 'desc' },
      include: { encuestador: { select: { nombre: true, usuario: true } } }
    });

    const ultimas = encuestas.slice(0, 5);

    res.json({ totalEncuestas, totalEncuestadores, ultimas, encuestas });
  } catch (error) {
    console.error('Error obteniendo métricas admin:', error);
    res.status(500).json({ error: 'Error obteniendo métricas' });
  }
};

app.get(['/api/admin/stats', '/admin/stats'], authenticateToken, requireAdmin, handleAdminStats);
app.get(['/api/admin/encuestas', '/admin/encuestas'], authenticateToken, requireAdmin, handleAdminStats);

// --- Ruta para subir nueva versión (Solo admin) ---
app.post(['/api/version', '/version'], authenticateToken, requireAdmin, (req: any, res: any, next: any) => {
  upload.single('apkFile')(req, res, (err: any) => {
    if (err) {
      console.error('Error de Multer al subir archivo:', err);
      return res.status(400).json({ error: `Error al subir el archivo: ${err.message}` });
    }
    next();
  });
}, async (req: any, res: any) => {
  try {
    const { version, descripcion, esObligatorio } = req.body;
    
    console.log('POST /api/version - body:', { version, descripcion, esObligatorio });
    console.log('POST /api/version - file:', req.file ? { filename: req.file.filename, size: req.file.size } : 'NO FILE');

    if (!version || !req.file) {
      return res.status(400).json({ error: 'La versión y el archivo APK son obligatorios' });
    }

    const urlApk = `/apk/${req.file.filename}`;
    
    const nuevaVersion = await prisma.appVersion.create({
      data: {
        version,
        descripcion: descripcion || '',
        esObligatorio: esObligatorio === 'true' || esObligatorio === true,
        urlApk
      }
    });

    console.log('Versión creada exitosamente:', nuevaVersion.id);
    res.json({ message: 'Versión publicada con éxito', version: nuevaVersion });
  } catch (error: any) {
    console.error('Error al subir versión:', error);
    res.status(500).json({ error: `Error al procesar la subida: ${error.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
});
