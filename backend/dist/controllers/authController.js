"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleLogin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("../config/db");
const env_1 = require("../config/env");
// Hash de referencia: se compara también cuando el usuario no existe, para que el tiempo de respuesta
// no revele si una cuenta existe.
const HASH_REFERENCIA = bcryptjs_1.default.hashSync('referencia-sin-usuario', 10);
const handleLogin = async (req, res) => {
    const { usuario, password } = req.body ?? {};
    if (typeof usuario !== 'string' || typeof password !== 'string' || !usuario.trim() || !password) {
        res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
        return;
    }
    try {
        const user = await db_1.prisma.usuario.findUnique({ where: { usuario: usuario.trim() } });
        const coincide = await bcryptjs_1.default.compare(password, user?.password ?? HASH_REFERENCIA);
        if (!user || !coincide) {
            res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
            return;
        }
        if (!user.estado) {
            res.status(403).json({ error: 'Usuario inactivo. Contacte al administrador.' });
            return;
        }
        const payload = { id: user.id, usuario: user.usuario, rol: user.rol, nombre: user.nombre };
        const token = jsonwebtoken_1.default.sign(payload, env_1.JWT_SECRET, { expiresIn: '30d', algorithm: 'HS256' });
        res.json({ token, user: payload });
    }
    catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
};
exports.handleLogin = handleLogin;
