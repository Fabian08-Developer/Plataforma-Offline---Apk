"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
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
    console.log('Usuario admin de prueba creado:', { admin });
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
