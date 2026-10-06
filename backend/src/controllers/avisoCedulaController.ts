import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { mergePhones } from '../utils/textUtils';
import { invalidarCacheDuplicados } from '../services/duplicateService';

/** Nombre y usuario de un encuestador, para mostrar quién hizo cada captura */
async function nombresDeUsuarios(ids: number[]): Promise<Map<number, { id: number; nombre: string; usuario: string }>> {
  const unicos = [...new Set(ids.filter((n) => Number.isInteger(n)))];
  const usuarios = await prisma.usuario.findMany({
    where: { id: { in: unicos } },
    select: { id: true, nombre: true, usuario: true },
  });
  return new Map(usuarios.map((u) => [u.id, u]));
}

/**
 * Avisos de cédula repetida entre encuestadores: cada uno muestra la versión previa y la recibida.
 * Por defecto solo los pendientes. Con ?resuelto=true se muestran los revisados.
 */
export const handleGetAvisosCedula = async (req: Request, res: Response): Promise<void> => {
  try {
    const mostrarResueltos = req.query.resuelto === 'true';
    const avisos = await prisma.avisoCedula.findMany({
      where: mostrarResueltos ? {} : { resuelto: false },
      orderBy: { creado_en: 'desc' },
      take: 200,
    });

    const encuestas = await prisma.encuesta.findMany({
      where: { id: { in: avisos.map((a) => a.encuesta_id) } },
      select: { id: true, documento_identidad: true, nombres: true, apellidos: true, encuestador_id: true },
    });
    const encuestaPorId = new Map(encuestas.map((e) => [e.id, e]));

    const usuarios = await nombresDeUsuarios(
      avisos.flatMap((a) => {
        const previo = (a.datos_previos as any)?.encuestador_id;
        const autor = a.encuestador_id;
        return [Number(previo), autor];
      })
    );

    res.json(
      avisos.map((a) => {
        const previo = (a.datos_previos as any)?.encuestador_id;
        return {
          id: a.id,
          documento_identidad: a.documento_identidad,
          creado_en: a.creado_en,
          resuelto: a.resuelto,
          encuesta_id: a.encuesta_id,
          // Versión que existía en el servidor, y la que llegó después
          previo: { encuestador: usuarios.get(Number(previo)) ?? null, ...(a.datos_previos as object) },
          recibido: { encuestador: usuarios.get(a.encuestador_id) ?? null, ...(a.datos_recibidos as object) },
          // Estado actual de la encuesta (puede haber cambiado desde el aviso); null si fue eliminada
          encuesta_actual: encuestaPorId.get(a.encuesta_id) ?? null,
        };
      })
    );
  } catch (error) {
    console.error('Error consultando avisos de cédula:', error);
    res.status(500).json({ error: 'Error al consultar los avisos de cédula' });
  }
};

/**
 * Decisión del administrador: reemplazar los datos de la encuesta original con la captura recibida.
 * El encuestador dueño de la encuesta no cambia. Los teléfonos se combinan (la captura primero, máximo 3).
 */
export const handleUsarCapturaAviso = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Aviso no encontrado' });
    return;
  }
  try {
    const aviso = await prisma.avisoCedula.findUnique({ where: { id } });
    if (!aviso) {
      res.status(404).json({ error: 'Aviso no encontrado' });
      return;
    }
    if (aviso.resuelto) {
      res.status(409).json({ error: 'Este aviso ya fue revisado.' });
      return;
    }

    const captura = aviso.datos_recibidos as Record<string, string>;
    const aplicada = await prisma.$transaction(async (tx) => {
      const encuesta = await tx.encuesta.findUnique({ where: { id: aviso.encuesta_id } });
      if (!encuesta) return false;

      const [tel1, tel2, tel3] = mergePhones(
        [captura.telefono_1, captura.telefono_2, captura.telefono_3],
        [encuesta.telefono_1, encuesta.telefono_2, encuesta.telefono_3]
      );
      await tx.encuesta.update({
        where: { id: encuesta.id },
        data: {
          tipo_documento: captura.tipo_documento || encuesta.tipo_documento,
          nombres: captura.nombres || encuesta.nombres,
          apellidos: captura.apellidos || encuesta.apellidos,
          telefono_1: tel1,
          telefono_2: tel2,
          telefono_3: tel3,
          direccion: captura.direccion || encuesta.direccion,
          profesion: captura.profesion || encuesta.profesion || '',
          fecha_registro: captura.fecha_registro || encuesta.fecha_registro,
          actualizado_en: new Date(),
        },
      });
      await tx.avisoCedula.update({ where: { id }, data: { resuelto: true } });
      return true;
    });

    if (!aplicada) {
      res.status(404).json({ error: 'La encuesta original ya no existe. Marque el aviso como revisado.' });
      return;
    }
    invalidarCacheDuplicados();
    res.json({ message: 'Captura aplicada a la encuesta original' });
  } catch (error) {
    console.error('Error aplicando captura de aviso:', error);
    res.status(500).json({ error: 'Error al aplicar la captura' });
  }
};

/** Marca un aviso como revisado y mantiene el registro actual del dueño. */
export const handleResolverAvisoCedula = async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: 'Aviso no encontrado' });
    return;
  }
  try {
    const existe = await prisma.avisoCedula.findUnique({ where: { id }, select: { id: true } });
    if (!existe) {
      res.status(404).json({ error: 'Aviso no encontrado' });
      return;
    }
    await prisma.avisoCedula.update({ where: { id }, data: { resuelto: true } });
    res.json({ message: 'Aviso marcado como revisado' });
  } catch (error) {
    console.error('Error resolviendo aviso de cédula:', error);
    res.status(500).json({ error: 'Error al actualizar el aviso' });
  }
};
