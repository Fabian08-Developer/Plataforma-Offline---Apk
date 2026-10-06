import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/db';
import { esViolacionUnicidad } from '../utils/prismaErrors';
import { registrarEliminaciones } from '../services/eliminadas';
import { invalidarCacheDuplicados } from '../services/duplicateService';

const LONGITUD_MINIMA_PASSWORD = 8;

/** Solo se gestionan cuentas de encuestador desde este módulo: nunca otros administradores */
async function buscarEncuestador(id: number) {
  if (!Number.isInteger(id)) return null;
  return prisma.usuario.findFirst({ where: { id, rol: 'encuestador' } });
}

function passwordInvalida(password: unknown): boolean {
  return password !== undefined && (typeof password !== 'string' || password.length < LONGITUD_MINIMA_PASSWORD);
}

export const handleGetEncuestadores = async (_req: Request, res: Response): Promise<void> => {
  try {
    const encuestadores = await prisma.usuario.findMany({
      where: { rol: 'encuestador' },
      select: {
        id: true,
        nombre: true,
        usuario: true,
        rol: true,
        estado: true,
        creado_en: true,
        _count: {
          select: { encuestas: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });
    res.json(encuestadores);
  } catch (error) {
    console.error('Error obteniendo encuestadores:', error);
    res.status(500).json({ error: 'Error al obtener encuestadores' });
  }
};

export const handleGetEncuestadorDetalle = async (req: Request, res: Response): Promise<void> => {
  try {
    const encuestador = await buscarEncuestador(Number(req.params.id));
    if (!encuestador) {
      res.status(404).json({ error: 'Encuestador no encontrado' });
      return;
    }

    const encuestas = await prisma.encuesta.findMany({
      where: { encuestador_id: encuestador.id },
      orderBy: { id: 'desc' },
    });

    const { password: _password, ...datosPublicos } = encuestador;
    res.json({ encuestador: datosPublicos, encuestas });
  } catch (error) {
    console.error('Error obteniendo detalle de encuestador:', error);
    res.status(500).json({ error: 'Error al obtener detalle del encuestador' });
  }
};

export const handleCreateEncuestador = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nombre, usuario, password } = req.body ?? {};
    if (typeof nombre !== 'string' || typeof usuario !== 'string' || !nombre.trim() || !usuario.trim()) {
      res.status(400).json({ error: 'Nombre y usuario son obligatorios' });
      return;
    }
    if (typeof password !== 'string' || passwordInvalida(password)) {
      res.status(400).json({ error: `La contraseña es obligatoria y debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres` });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const nuevo = await prisma.usuario.create({
      data: { nombre: nombre.trim(), usuario: usuario.trim(), password: hashedPassword, rol: 'encuestador', estado: true },
    });
    const { password: _password, ...datosPublicos } = nuevo;
    res.json({ message: 'Encuestador creado con éxito', usuario: datosPublicos });
  } catch (error) {
    if (esViolacionUnicidad(error)) {
      res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
      return;
    }
    console.error('Error creando encuestador:', error);
    res.status(500).json({ error: 'Error al crear encuestador' });
  }
};

export const handleUpdateEncuestador = async (req: Request, res: Response): Promise<void> => {
  try {
    const encuestador = await buscarEncuestador(Number(req.params.id));
    if (!encuestador) {
      res.status(404).json({ error: 'Encuestador no encontrado' });
      return;
    }

    const { nombre, usuario, password } = req.body ?? {};
    if (passwordInvalida(password)) {
      res.status(400).json({ error: `La contraseña debe tener al menos ${LONGITUD_MINIMA_PASSWORD} caracteres` });
      return;
    }

    const updateData: { nombre?: string; usuario?: string; password?: string } = {};
    if (typeof nombre === 'string' && nombre.trim()) updateData.nombre = nombre.trim();
    if (typeof usuario === 'string' && usuario.trim()) updateData.usuario = usuario.trim();
    if (typeof password === 'string') updateData.password = await bcrypt.hash(password, 10);

    const actualizado = await prisma.usuario.update({ where: { id: encuestador.id }, data: updateData });
    const { password: _password, ...datosPublicos } = actualizado;
    res.json({ message: 'Encuestador actualizado con éxito', usuario: datosPublicos });
  } catch (error) {
    if (esViolacionUnicidad(error)) {
      res.status(400).json({ error: 'El nombre de usuario ya está registrado' });
      return;
    }
    console.error('Error actualizando encuestador:', error);
    res.status(500).json({ error: 'Error al actualizar encuestador' });
  }
};

export const handleDeleteEncuestador = async (req: any, res: Response): Promise<void> => {
  try {
    const encuestador = await buscarEncuestador(Number(req.params.id));
    if (!encuestador) {
      res.status(404).json({ error: 'Encuestador no encontrado' });
      return;
    }

    const { adminPassword } = req.body || {};
    const totalEncuestas = await prisma.encuesta.count({ where: { encuestador_id: encuestador.id } });

    if (totalEncuestas > 0) {
      if (!adminPassword) {
        res.status(400).json({
          requiresPassword: true,
          totalEncuestas,
          error: `Este encuestador tiene ${totalEncuestas} encuestas registradas. Ingrese su contraseña de administrador para confirmar la eliminación.`,
        });
        return;
      }

      // Validar la contraseña del administrador autenticado
      const adminUser = await prisma.usuario.findUnique({ where: { id: req.user!.id } });
      if (!adminUser || typeof adminPassword !== 'string' || !(await bcrypt.compare(adminPassword, adminUser.password))) {
        res.status(403).json({ error: 'Contraseña de administrador incorrecta' });
        return;
      }
    }

    // Eliminación atómica: se registran las cédulas como eliminadas y se borran las encuestas y el usuario juntos.
    // Así los dispositivos no vuelven a subir esas encuestas.
    await prisma.$transaction(async (tx) => {
      if (totalEncuestas > 0) {
        const encuestas = await tx.encuesta.findMany({
          where: { encuestador_id: encuestador.id },
          select: { documento_identidad: true },
        });
        await registrarEliminaciones(tx, encuestas.map((e) => e.documento_identidad));
        await tx.encuesta.deleteMany({ where: { encuestador_id: encuestador.id } });
      }
      await tx.usuario.delete({ where: { id: encuestador.id } });
    });

    invalidarCacheDuplicados();
    res.json({ message: 'Encuestador y todas sus encuestas eliminados con éxito', encuestasEliminadas: totalEncuestas });
  } catch (error) {
    console.error('Error eliminando encuestador:', error);
    res.status(500).json({ error: 'Error al eliminar encuestador' });
  }
};
