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

app.post('/api/login', async (req, res) => {
  const { usuario, password } = req.body;

  try {
    const user = await prisma.usuario.findUnique({ where: { usuario } });
    
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }

    if (!user.estado) {
      return res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
    }

    const token = jwt.sign(
      { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre }, 
      JWT_SECRET, 
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// --- Rutas Protegidas y Sincronización ---

const handleSync = async (req: any, res: any) => {
  const { encuestas } = req.body;
  let encuestadorId = req.user?.id || req.body.encuestador_id || null;

  if (!Array.isArray(encuestas) || encuestas.length === 0) {
    return res.status(400).json({ error: 'Formato inválido o no hay encuestas para sincronizar' });
  }

  try {
    const encuestasProcesadasIds = [];

    for (const data of encuestas) {
      // Buscar si ya existe por documento de identidad
      const existe = await prisma.encuesta.findFirst({
        where: { documento_identidad: data.documento_identidad }
      });

      if (!existe) {
        const nueva = await prisma.encuesta.create({
          data: {
            encuestador_id: encuestadorId || data.encuestador_id || null,
            tipo_documento: data.tipo_documento,
            documento_identidad: data.documento_identidad,
            nombres: data.nombres,
            apellidos: data.apellidos,
            telefono_1: data.telefono_1,
            telefono_2: data.telefono_2 || '',
            telefono_3: data.telefono_3 || '',
            direccion: data.direccion,
            profesion: data.profesion || '',
            fecha_registro: data.fecha_registro,
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
  } catch (error) {
    console.error('Error al sincronizar:', error);
    res.status(500).json({ error: 'Error interno del servidor al procesar las encuestas' });
  }
};

// Sincronización acepta petición autenticada o directa desde dispositivos encuestadores
app.post(['/api/sync', '/sync'], (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  if (authHeader) {
    return authenticateToken(req, res, next);
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
