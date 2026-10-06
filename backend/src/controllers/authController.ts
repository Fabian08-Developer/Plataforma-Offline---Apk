import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { JWT_SECRET } from '../config/env';

// Hash de referencia: se compara también cuando el usuario no existe, para que el tiempo de respuesta
// no revele si una cuenta existe.
const HASH_REFERENCIA = bcrypt.hashSync('referencia-sin-usuario', 10);

export const handleLogin = async (req: Request, res: Response): Promise<void> => {
  const { usuario, password } = req.body ?? {};
  if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario.trim() || !password) {
    res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    return;
  }

  try {
    const user = await prisma.usuario.findUnique({ where: { usuario: usuario.trim() } });
    const coincide = await bcrypt.compare(password, user?.password ?? HASH_REFERENCIA);

    if (!user || !coincide) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
      return;
    }
    if (!user.estado) {
      res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
      return;
    }

    const payload = { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
    res.json({ token, user: payload });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
