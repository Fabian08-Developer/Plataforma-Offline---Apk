import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env';
import { prisma } from '../config/db';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    usuario: string;
    rol: string;
    nombre: string;
  };
}

/**
 * Verifica el token y comprueba en la base de datos que el usuario siga existiendo y activo.
 * El JWT por sí solo no basta: así, desactivar o eliminar un usuario revoca su acceso de inmediato.
 * Se tipa como `any` para poder usarlo con router.use() de Express sin conflictos de tipos.
 */
export async function authenticateToken(req: any, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
    return;
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as jwt.JwtPayload;
  } catch {
    res.status(403).json({ error: 'Token inválido o expirado.' });
    return;
  }

  const id = Number(payload.id);
  if (!Number.isInteger(id)) {
    res.status(403).json({ error: 'Token inválido o expirado.' });
    return;
  }

  try {
    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, usuario: true, rol: true, nombre: true, estado: true },
    });
    if (!usuario || !usuario.estado) {
      res.status(403).json({ error: 'Usuario inactivo o inexistente. Inicie sesión nuevamente.' });
      return;
    }
    // El rol se toma de la base de datos, no del token: un cambio de rol surte efecto de inmediato
    req.user = { id: usuario.id, usuario: usuario.usuario, rol: usuario.rol, nombre: usuario.nombre };
    next();
  } catch (error) {
    console.error('Error verificando la sesión:', error);
    res.status(500).json({ error: 'Error al verificar la sesión.' });
  }
}

export function requireAdmin(req: any, res: Response, next: NextFunction): void {
  if (req.user?.rol !== 'admin') {
    res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador.' });
    return;
  }
  next();
}
