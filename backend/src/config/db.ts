import { Pool } from 'pg';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DATABASE_URL } from './env';

console.log('Iniciando backend con DATABASE_URL:', DATABASE_URL ? 'Configurada' : 'NO DEFINIDA');

export const pool = new Pool({ connectionString: DATABASE_URL });
pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({ adapter });

// Inicializar tablas de auditoría requeridas para el funcionamiento del sistema
export async function initAuditTables(): Promise<void> {
  try {
    await pool.query(`
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
  } catch (err: any) {
    console.warn('Nota sobre tablas de auditoría en PostgreSQL:', err.message);
  }
}
