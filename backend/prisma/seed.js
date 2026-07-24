"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma = new client_1.PrismaClient();
async function main() {
    const hash = await bcryptjs_1.default.hash('123456', 10);
    const admin = await prisma.usuario.upsert({
        where: { usuario: 'admin' },
        update: {},
        create: {
            nombre: 'Administrador General',
            usuario: 'admin',
            password: hash,
            rol: 'admin'
        }
    });
    const encuestador = await prisma.usuario.upsert({
        where: { usuario: 'encuestador' },
        update: {},
        create: {
            nombre: 'Juan Encuestador',
            usuario: 'encuestador',
            password: hash,
            rol: 'encuestador'
        }
    });
    console.log('Usuarios de prueba creados:', { admin, encuestador });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
