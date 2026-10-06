"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleResolverAvisoCedula = exports.handleUsarCapturaAviso = exports.handleGetAvisosCedula = void 0;
const db_1 = require("../config/db");
const textUtils_1 = require("../utils/textUtils");
const duplicateService_1 = require("../services/duplicateService");
/** Nombre y usuario de un encuestador, para mostrar quién hizo cada captura */
async function nombresDeUsuarios(ids) {
    const unicos = [...new Set(ids.filter((n) => Number.isInteger(n)))];
    const usuarios = await db_1.prisma.usuario.findMany({
        where: { id: { in: unicos } },
        select: { id: true, nombre: true, usuario: true },
    });
    return new Map(usuarios.map((u) => [u.id, u]));
}
/**
 * Avisos de cédula repetida entre encuestadores: cada uno muestra la versión previa y la recibida.
 * Por defecto solo los pendientes. Con ?resuelto=true se muestran los revisados.
 */
const handleGetAvisosCedula = async (req, res) => {
    try {
        const mostrarResueltos = req.query.resuelto === 'true';
        const avisos = await db_1.prisma.avisoCedula.findMany({
            where: mostrarResueltos ? {} : { resuelto: false },
            orderBy: { creado_en: 'desc' },
            take: 200,
        });
        const encuestas = await db_1.prisma.encuesta.findMany({
            where: { id: { in: avisos.map((a) => a.encuesta_id) } },
            select: { id: true, documento_identidad: true, nombres: true, apellidos: true, encuestador_id: true },
        });
        const encuestaPorId = new Map(encuestas.map((e) => [e.id, e]));
        const usuarios = await nombresDeUsuarios(avisos.flatMap((a) => {
            const previo = a.datos_previos?.encuestador_id;
            const autor = a.encuestador_id;
            return [Number(previo), autor];
        }));
        res.json(avisos.map((a) => {
            const previo = a.datos_previos?.encuestador_id;
            return {
                id: a.id,
                documento_identidad: a.documento_identidad,
                creado_en: a.creado_en,
                resuelto: a.resuelto,
                encuesta_id: a.encuesta_id,
                // Versión que existía en el servidor, y la que llegó después
                previo: { encuestador: usuarios.get(Number(previo)) ?? null, ...a.datos_previos },
                recibido: { encuestador: usuarios.get(a.encuestador_id) ?? null, ...a.datos_recibidos },
                // Estado actual de la encuesta (puede haber cambiado desde el aviso); null si fue eliminada
                encuesta_actual: encuestaPorId.get(a.encuesta_id) ?? null,
            };
        }));
    }
    catch (error) {
        console.error('Error consultando avisos de cédula:', error);
        res.status(500).json({ error: 'Error al consultar los avisos de cédula' });
    }
};
exports.handleGetAvisosCedula = handleGetAvisosCedula;
/**
 * Decisión del administrador: reemplazar los datos de la encuesta original con la captura recibida.
 * El encuestador dueño de la encuesta no cambia. Los teléfonos se combinan (la captura primero, máximo 3).
 */
const handleUsarCapturaAviso = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(404).json({ error: 'Aviso no encontrado' });
        return;
    }
    try {
        const aviso = await db_1.prisma.avisoCedula.findUnique({ where: { id } });
        if (!aviso) {
            res.status(404).json({ error: 'Aviso no encontrado' });
            return;
        }
        if (aviso.resuelto) {
            res.status(409).json({ error: 'Este aviso ya fue revisado.' });
            return;
        }
        const captura = aviso.datos_recibidos;
        const aplicada = await db_1.prisma.$transaction(async (tx) => {
            const encuesta = await tx.encuesta.findUnique({ where: { id: aviso.encuesta_id } });
            if (!encuesta)
                return false;
            const [tel1, tel2, tel3] = (0, textUtils_1.mergePhones)([captura.telefono_1, captura.telefono_2, captura.telefono_3], [encuesta.telefono_1, encuesta.telefono_2, encuesta.telefono_3]);
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
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json({ message: 'Captura aplicada a la encuesta original' });
    }
    catch (error) {
        console.error('Error aplicando captura de aviso:', error);
        res.status(500).json({ error: 'Error al aplicar la captura' });
    }
};
exports.handleUsarCapturaAviso = handleUsarCapturaAviso;
/** Marca un aviso como revisado y mantiene el registro actual del dueño. */
const handleResolverAvisoCedula = async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        res.status(404).json({ error: 'Aviso no encontrado' });
        return;
    }
    try {
        const existe = await db_1.prisma.avisoCedula.findUnique({ where: { id }, select: { id: true } });
        if (!existe) {
            res.status(404).json({ error: 'Aviso no encontrado' });
            return;
        }
        await db_1.prisma.avisoCedula.update({ where: { id }, data: { resuelto: true } });
        res.json({ message: 'Aviso marcado como revisado' });
    }
    catch (error) {
        console.error('Error resolviendo aviso de cédula:', error);
        res.status(500).json({ error: 'Error al actualizar el aviso' });
    }
};
exports.handleResolverAvisoCedula = handleResolverAvisoCedula;
