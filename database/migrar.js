// Deja el esquema al día, contra la base que digan las variables de entorno.
//
//   npm run db:migrate                 -> la base local (reservas.db)
//   TURSO_DATABASE_URL=... npm run db:migrate  -> Turso
//
// Idempotente y no destructivo: lo que ya está aplicado se saltea, y ninguna
// migración lleva DROP. Se puede correr sobre la base de producción sin miedo.

const bd = require('../bd.js');

async function principal() {
  console.log(`Migrando la base (${bd.descripcionDeLaBase()})...`);

  const aplicadas = await bd.migrar({ registrar: (linea) => console.log(linea) });

  if (aplicadas.length === 0) {
    console.log('El esquema ya estaba al día. No había nada que aplicar.');
  } else {
    console.log(`Listo: ${aplicadas.length} migración(es) aplicada(s).`);
  }

  bd.cerrar();
}

principal().catch((error) => {
  console.error(`La migración falló: ${error.message}`);
  process.exitCode = 1;
});
