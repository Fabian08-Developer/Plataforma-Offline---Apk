import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../config/db';
import { publicPath } from '../config/env';
import { compararVersiones } from '../utils/versiones';

/**
 * Versión que se ofrece a los dispositivos: la de número más alto (no la última creada).
 * Si varias tienen el mismo número, gana la creada después.
 */
async function versionMasAlta() {
  const todas = await prisma.appVersion.findMany({ orderBy: { id: 'asc' } });
  if (todas.length === 0) return null;
  return todas.reduce((mejor, v) => (compararVersiones(v.version, mejor.version) >= 0 ? v : mejor));
}

export const handleDownload = async (_req: Request, res: Response): Promise<void> => {
  try {
    const ultima = await versionMasAlta();
    if (!ultima) {
      res.status(404).json({ error: 'No hay versiones disponibles' });
      return;
    }
    const filename = path.basename(ultima.urlApk);
    const filePath = path.join(publicPath, 'apk', filename);
    if (fs.existsSync(filePath)) {
      res.download(filePath, `app-v${ultima.version}.apk`);
    } else {
      res.status(404).json({ error: 'Archivo APK no encontrado' });
    }
  } catch {
    res.status(500).json({ error: 'Error al descargar el APK' });
  }
};

export const handleVersionInfo = async (req: Request, res: Response): Promise<void> => {
  try {
    const ultima = await versionMasAlta();
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
  } catch {
    res.status(500).json({ error: 'Error al consultar la versión' });
  }
};

const FORMATO_VERSION = /^\d+(\.\d+){0,3}$/;

/** Un APK es un ZIP: los primeros 4 bytes deben ser la firma PK\x03\x04 */
function esApkValido(ruta: string): boolean {
  const fd = fs.openSync(ruta, 'r');
  try {
    const cabecera = Buffer.alloc(4);
    fs.readSync(fd, cabecera, 0, 4, 0);
    return cabecera.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  } finally {
    fs.closeSync(fd);
  }
}

function descartarArchivo(ruta: string): void {
  fs.unlink(ruta, () => {
    // Si ya no existe, no hay nada que hacer
  });
}

export const handleUploadVersion = async (req: any, res: Response): Promise<void> => {
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
    const nuevaVersion = await prisma.appVersion.create({
      data: {
        version: version.trim(),
        descripcion: typeof descripcion === 'string' ? descripcion : '',
        esObligatorio: esObligatorio === 'true' || esObligatorio === true,
        urlApk,
      },
    });
    res.json({ message: 'Versión publicada con éxito', version: nuevaVersion });
  } catch (error) {
    // Si no se pudo registrar, el archivo no debe quedar huérfano en la carpeta pública
    descartarArchivo(req.file.path);
    console.error('Error al subir versión:', error);
    res.status(500).json({ error: 'Error al procesar la subida' });
  }
};

export const handleGetVersionsList = async (_req: Request, res: Response): Promise<void> => {
  try {
    const versiones = await prisma.appVersion.findMany({
      orderBy: { id: 'desc' },
    });
    res.json(versiones);
  } catch (error) {
    console.error('Error al listar versiones:', error);
    res.status(500).json({ error: 'Error al consultar historial de versiones' });
  }
};

