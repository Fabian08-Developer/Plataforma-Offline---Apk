import { Response } from 'express';
import { prisma } from '../config/db';
import { normalizeText, levenshteinAcotada } from '../utils/textUtils';
import { esPropia, MENSAJE_CEDULA_AJENA, MENSAJE_SIMILAR_AJENO } from '../utils/visibilidad';

/** Máximo de coincidencias que devuelve la búsqueda de similares */
const MAX_SIMILARES = 20;
/** Máximo de cédulas por consulta de reconciliación */
const MAX_DOCUMENTOS_CONSULTA = 1000;

// ENCUESTADOR - Verificar si un documento ya está registrado en el servidor
export const handleVerificarDocumento = async (req: any, res: Response): Promise<void> => {
  try {
    const doc = String(req.params.documento || '').trim();
    if (doc.length < 5) {
      res.status(400).json({ error: 'Documento demasiado corto' });
      return;
    }

    const encuesta = await prisma.encuesta.findFirst({
      where: { documento_identidad: doc },
    });

    if (!encuesta) {
      res.status(404).json(null);
      return;
    }
    // Registro de otro encuestador: solo se confirma que existe. Sus datos personales no salen del servidor.
    if (!esPropia(encuesta.encuestador_id, req.user)) {
      res.json({ documento_identidad: doc, ajeno: true, mensaje: MENSAJE_CEDULA_AJENA });
      return;
    }
    res.json(encuesta);
  } catch (error) {
    console.error('Error verificando documento:', error);
    res.status(500).json({ error: 'Error al verificar documento' });
  }
};

// ENCUESTADOR - Buscar registros con documento o nombre similar al indicado
export const handleBuscarSimilares = async (req: any, res: Response): Promise<void> => {
  try {
    const doc = String(req.params.documento || '').trim();
    if (doc.length < 4) {
      res.status(400).json({ error: 'Documento demasiado corto' });
      return;
    }

    const nombresQuery = String(req.query?.nombres || '').trim();
    const apellidosQuery = String(req.query?.apellidos || '').trim();
    const fullNameQuery = normalizeText(`${nombresQuery} ${apellidosQuery}`);

    // Solo los campos necesarios para mostrar la advertencia
    const todos = await prisma.encuesta.findMany({
      select: {
        id: true,
        encuestador_id: true,
        documento_identidad: true,
        nombres: true,
        apellidos: true,
        tipo_documento: true,
      },
    });

    const similares: Array<{ id: number | null; documento_identidad: string; nombres: string; apellidos: string; tipo_documento: string; ajeno?: boolean; razon?: string }> = [];
    let avisoAjeno = false;
    for (const ex of todos) {
      if (similares.length >= MAX_SIMILARES) break;
      if (ex.documento_identidad === doc) continue;

      // Criterio 1: documento difiere en 1 o 2 caracteres. Criterio 2: nombre completo idéntico o muy similar
      const coincide =
        levenshteinAcotada(doc, ex.documento_identidad, 2) <= 2 ||
        (fullNameQuery.length > 5 &&
          (normalizeText(`${ex.nombres} ${ex.apellidos}`) === fullNameQuery ||
            (normalizeText(`${ex.nombres} ${ex.apellidos}`).length > 5 &&
              levenshteinAcotada(fullNameQuery, normalizeText(`${ex.nombres} ${ex.apellidos}`), 2) <= 2)));
      if (!coincide) continue;

      if (esPropia(ex.encuestador_id, req.user)) {
        similares.push({ id: ex.id, documento_identidad: ex.documento_identidad, nombres: ex.nombres, apellidos: ex.apellidos, tipo_documento: ex.tipo_documento });
      } else if (!avisoAjeno) {
        // Registros de otros encuestadores: un único aviso genérico, sin datos personales
        avisoAjeno = true;
        similares.push({ id: null, documento_identidad: '', nombres: '', apellidos: '', tipo_documento: '', ajeno: true, razon: MENSAJE_SIMILAR_AJENO });
      }
    }

    res.json(similares);
  } catch (error) {
    console.error('Error buscando similares:', error);
    res.status(500).json({ error: 'Error al buscar registros similares' });
  }
};

// ENCUESTADOR - Mis encuestas registradas
export const handleGetMisEncuestas = async (req: any, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Usuario no autenticado' });
      return;
    }

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

/**
 * RECONCILIACIÓN - El dispositivo envía las cédulas que tiene como sincronizadas
 * y el servidor responde cuáles ya no existen. Así no se expone el listado completo de la base.
 */
export const handleDocumentosFaltantes = async (req: any, res: Response): Promise<void> => {
  const { documentos } = req.body ?? {};
  if (
    !Array.isArray(documentos) ||
    documentos.length === 0 ||
    documentos.length > MAX_DOCUMENTOS_CONSULTA ||
    !documentos.every((d) => typeof d === 'string')
  ) {
    res.status(400).json({ error: `Envíe entre 1 y ${MAX_DOCUMENTOS_CONSULTA} documentos como texto.` });
    return;
  }

  try {
    const solicitados = [...new Set(documentos.map((d: string) => d.trim()).filter(Boolean))];
    const encontrados = await prisma.encuesta.findMany({
      where: { documento_identidad: { in: solicitados } },
      select: { documento_identidad: true },
    });
    const existentes = new Set(encontrados.map((e) => e.documento_identidad));
    res.json(solicitados.filter((d) => !existentes.has(d)));
  } catch (error) {
    console.error('Error consultando documentos faltantes:', error);
    res.status(500).json({ error: 'Error al consultar documentos' });
  }
};
