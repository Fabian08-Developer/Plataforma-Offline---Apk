"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleAdminStats = exports.handleDeleteEncuesta = exports.handleUpdateEncuesta = exports.handleCreateEncuestaAdmin = exports.handleGetEncuestaById = void 0;
const db_1 = require("../config/db");
const duplicateService_1 = require("../services/duplicateService");
const eliminadas_1 = require("../services/eliminadas");
const prismaErrors_1 = require("../utils/prismaErrors");
const INCLUYE_ENCUESTADOR = { encuestador: { select: { id: true, nombre: true, usuario: true } } };
const handleGetEncuestaById = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const encuesta = await db_1.prisma.encuesta.findUnique({
            where: { id },
            include: INCLUYE_ENCUESTADOR,
        });
        if (!encuesta) {
            res.status(404).json({ error: 'Encuesta no encontrada' });
            return;
        }
        res.json(encuesta);
    }
    catch (error) {
        console.error('Error obteniendo encuesta:', error);
        res.status(500).json({ error: 'Error al obtener encuesta' });
    }
};
exports.handleGetEncuestaById = handleGetEncuestaById;
const handleCreateEncuestaAdmin = async (req, res) => {
    try {
        const { encuestador_id, tipo_documento, documento_identidad, nombres, apellidos, telefono_1, telefono_2, telefono_3, direccion, profesion, fecha_registro, } = req.body ?? {};
        if (!documento_identidad) {
            res.status(400).json({ error: 'El documento de identidad es obligatorio' });
            return;
        }
        const documento = String(documento_identidad).trim();
        // El encuestador asignado debe existir; si no, la encuesta queda a nombre del administrador que la crea
        let targetUserId = req.user.id;
        if (encuestador_id) {
            const usuario = await db_1.prisma.usuario.findUnique({ where: { id: Number(encuestador_id) } });
            if (usuario)
                targetUserId = usuario.id;
        }
        const resultado = await db_1.prisma.$transaction(async (tx) => {
            // Al crear manualmente una cédula que estaba marcada como eliminada, se libera la marca
            await tx.$executeRaw `DELETE FROM encuestas_eliminadas WHERE documento_identidad = ${documento}`;
            const existe = await tx.encuesta.findFirst({ where: { documento_identidad: documento } });
            if (existe) {
                const actualizada = await tx.encuesta.update({
                    where: { id: existe.id },
                    data: {
                        encuestador_id: targetUserId,
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
                        actualizado_en: new Date(),
                    },
                    include: INCLUYE_ENCUESTADOR,
                });
                return { encuesta: actualizada, creada: false };
            }
            const nueva = await tx.encuesta.create({
                data: {
                    encuestador_id: targetUserId,
                    tipo_documento: String(tipo_documento || 'C.C'),
                    documento_identidad: documento,
                    nombres: String(nombres || ''),
                    apellidos: String(apellidos || ''),
                    telefono_1: String(telefono_1 || ''),
                    telefono_2: telefono_2 ? String(telefono_2) : '',
                    telefono_3: telefono_3 ? String(telefono_3) : '',
                    direccion: String(direccion || ''),
                    profesion: profesion ? String(profesion) : '',
                    fecha_registro: String(fecha_registro || new Date().toISOString().split('T')[0]),
                    estado_sincronizacion: 'sincronizado',
                    actualizado_en: new Date(),
                },
                include: INCLUYE_ENCUESTADOR,
            });
            return { encuesta: nueva, creada: true };
        });
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json(resultado.creada
            ? { message: 'Encuesta creada con éxito', encuesta: resultado.encuesta }
            : { message: 'Encuesta actualizada con éxito', encuesta: resultado.encuesta });
    }
    catch (error) {
        if ((0, prismaErrors_1.esViolacionUnicidad)(error)) {
            res.status(400).json({ error: 'Ya existe una encuesta con ese documento. Intente nuevamente.' });
            return;
        }
        console.error('Error creando encuesta admin:', error);
        res.status(500).json({ error: 'Error al crear encuesta' });
    }
};
exports.handleCreateEncuestaAdmin = handleCreateEncuestaAdmin;
const handleUpdateEncuesta = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const { tipo_documento, documento_identidad, nombres, apellidos, telefono_1, telefono_2, telefono_3, direccion, profesion, fecha_registro, } = req.body ?? {};
        if (!documento_identidad) {
            res.status(400).json({ error: 'El documento de identidad es obligatorio' });
            return;
        }
        const documento = String(documento_identidad).trim();
        // Si la encuesta no existe, responder 404 (antes el update lanzaba un error y respondía 500)
        if (!Number.isInteger(id) || !(await db_1.prisma.encuesta.findUnique({ where: { id }, select: { id: true } }))) {
            res.status(404).json({ error: 'Encuesta no encontrada' });
            return;
        }
        // Verificar si OTRA encuesta distinta ya tiene este documento registrado
        const existeOtro = await db_1.prisma.encuesta.findFirst({
            where: {
                documento_identidad: documento,
                NOT: { id },
            },
        });
        if (existeOtro) {
            res.status(400).json({
                error: `El documento ${documento} ya está registrado en la encuesta de ${existeOtro.nombres} ${existeOtro.apellidos} (ID: #${existeOtro.id}).`,
            });
            return;
        }
        const encuesta = await db_1.prisma.encuesta.update({
            where: { id },
            data: {
                tipo_documento: String(tipo_documento || 'C.C'),
                documento_identidad: documento,
                nombres: String(nombres || ''),
                apellidos: String(apellidos || ''),
                telefono_1: String(telefono_1 || ''),
                telefono_2: telefono_2 ? String(telefono_2) : '',
                telefono_3: telefono_3 ? String(telefono_3) : '',
                direccion: String(direccion || ''),
                profesion: profesion ? String(profesion) : '',
                fecha_registro: String(fecha_registro || new Date().toISOString().split('T')[0]),
                // Una edición del administrador es la más reciente: prevalece sobre copias de los dispositivos
                actualizado_en: new Date(),
            },
        });
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json({ message: 'Encuesta actualizada con éxito', encuesta });
    }
    catch (error) {
        if ((0, prismaErrors_1.esViolacionUnicidad)(error)) {
            res.status(400).json({ error: 'Ya existe una encuesta con ese documento.' });
            return;
        }
        console.error('Error actualizando encuesta:', error);
        res.status(500).json({ error: 'Error al actualizar encuesta' });
    }
};
exports.handleUpdateEncuesta = handleUpdateEncuesta;
const handleDeleteEncuesta = async (req, res) => {
    try {
        const id = Number(req.params.id);
        const eliminada = Number.isInteger(id) && (await db_1.prisma.$transaction(async (tx) => {
            const encuesta = await tx.encuesta.findUnique({ where: { id } });
            if (!encuesta)
                return false;
            // Se registra la cédula como eliminada en la misma transacción que borra la encuesta
            await (0, eliminadas_1.registrarEliminaciones)(tx, [encuesta.documento_identidad]);
            await tx.encuesta.delete({ where: { id } });
            return true;
        }));
        if (!eliminada) {
            res.status(404).json({ error: 'Encuesta no encontrada' });
            return;
        }
        (0, duplicateService_1.invalidarCacheDuplicados)();
        res.json({ message: 'Encuesta eliminada con éxito' });
    }
    catch (error) {
        console.error('Error eliminando encuesta:', error);
        res.status(500).json({ error: 'Error al eliminar encuesta' });
    }
};
exports.handleDeleteEncuesta = handleDeleteEncuesta;
const handleAdminStats = async (_req, res) => {
    try {
        const totalEncuestas = await db_1.prisma.encuesta.count();
        const totalEncuestadores = await db_1.prisma.usuario.count({ where: { rol: 'encuestador' } });
        const encuestas = await db_1.prisma.encuesta.findMany({
            orderBy: { sincronizado_en: 'desc' },
            include: INCLUYE_ENCUESTADOR,
        });
        let totalDuplicados = 0;
        try {
            // Usa la caché de duplicados: no recalcula en cada carga del dashboard
            const duplicados = await (0, duplicateService_1.findDuplicatesList)();
            totalDuplicados = duplicados.length;
        }
        catch {
            // Continuar si falla el cálculo de duplicados
        }
        res.json({ totalEncuestas, totalEncuestadores, totalDuplicados, ultimas: encuestas.slice(0, 5), encuestas });
    }
    catch (error) {
        console.error('Error obteniendo métricas:', error);
        res.status(500).json({ error: 'Error obteniendo métricas' });
    }
};
exports.handleAdminStats = handleAdminStats;
