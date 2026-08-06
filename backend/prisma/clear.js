"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const adapter_pg_1 = require("@prisma/adapter-pg");
const connectionString = process.env.DATABASE_URL;
const pool = new pg_1.Pool({ connectionString });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
async function main() {
    await prisma.encuesta.deleteMany({});
    await prisma.usuario.deleteMany({
        where: {
            usuario: { not: 'admin' }
        }
    });
    console.log('Datos simulados eliminados con éxito. Solo queda el admin.');
}
main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
