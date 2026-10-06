import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

// Crea el administrador inicial. La contraseña NO tiene valor por defecto: se indica con ADMIN_PASSWORD.
// Uso (una sola vez, con el backend apagado o sin acceso público):
//   ADMIN_PASSWORD="una-contraseña-larga" npx prisma db seed
const adminPassword = process.env.ADMIN_PASSWORD ?? '';
if (adminPassword.length < 8) {
  console.error('Defina ADMIN_PASSWORD con al menos 8 caracteres antes de ejecutar el seed.');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash(adminPassword, 10);

  // update: {} → si el admin ya existe, no se cambia su contraseña
  const admin = await prisma.usuario.upsert({
    where: { usuario: 'admin' },
    update: {},
    create: {
      nombre: 'Administrador General',
      usuario: 'admin',
      password: hash,
      rol: 'admin',
    },
  });

  console.log('Usuario admin listo:', { id: admin.id, usuario: admin.usuario, rol: admin.rol });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
