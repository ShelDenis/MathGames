import '../src/env';
import bcrypt from 'bcryptjs';
import prisma from '../src/db';

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@mathgames.local';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const name = process.env.ADMIN_NAME ?? 'Администратор';

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, name, role: 'ADMIN', password: await bcrypt.hash(password, 10) },
  });
  console.log(`Администратор готов: ${user.email} (id ${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
