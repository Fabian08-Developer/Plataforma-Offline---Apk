import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash('123456', 10);

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
