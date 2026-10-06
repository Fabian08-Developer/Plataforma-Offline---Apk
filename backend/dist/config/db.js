"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = exports.pool = void 0;
exports.initAuditTables = initAuditTables;
const pg_1 = require("pg");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const env_1 = require("./env");
console.log('Iniciando backend con DATABASE_URL:', env_1.DATABASE_URL ? 'Configurada' : 'NO DEFINIDA');
exports.pool = new pg_1.Pool({ connectionString: env_1.DATABASE_URL });
exports.pool.on('error', (err) => {
    console.error('PostgreSQL pool error:', err);
});
const adapter = new adapter_pg_1.PrismaPg(exports.pool);
exports.prisma = new client_1.PrismaClient({ adapter });
// Inicializar tablas de auditoría requeridas para el funcionamiento del sistema
async function initAuditTables() {
    try {
        await exports.pool.query(`
      CREATE TABLE IF NOT EXISTS duplicados_revisados (
        id SERIAL PRIMARY KEY,
        survey_a_id INT NOT NULL,
        survey_b_id INT NOT NULL,
        accion VARCHAR(50) DEFAULT 'aprobado',
        revisado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(survey_a_id, survey_b_id)
      );
      CREATE TABLE IF NOT EXISTS encuestas_eliminadas (
        id SERIAL PRIMARY KEY,
        documento_identidad VARCHAR(50) NOT NULL UNIQUE,
        eliminado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    }
    catch (err) {
        console.warn('Nota sobre tablas de auditoría en PostgreSQL:', err.message);
    }
}
