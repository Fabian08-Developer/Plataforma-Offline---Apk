import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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
