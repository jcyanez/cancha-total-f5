// Rehace la base LOCAL desde cero con reservas de ejemplo.
// Uso: npm run datos
//
// Es un atajo de desarrollo, y hace lo mismo que hacía antes: borra el archivo
// de la base y lo recrea sembrado. Ahora el esquema lo pone la migración y las
// filas las pone database/sembrar.js: acá no hay ni CREATE TABLE ni INSERT
// repetidos (hallazgo E-9).
//
// Se niega a correr si las variables apuntan a una base remota: `npm run datos`
// borra, y lo que borra tiene que ser el archivo de la máquina de quien lo
// corre. Para sembrar Turso está `npm run db:seed`.

const fs = require('node:fs');
const path = require('node:path');
const bd = require('./bd.js');
const { sembrar } = require('./database/sembrar.js');

const RUTA_DB = process.env.CANCHA_BD || path.join(__dirname, 'reservas.db');

async function principal() {
  if (bd.esRemota()) {
    throw new Error(
      'TURSO_DATABASE_URL está definida: `npm run datos` borra la base y no va a ' +
      'hacerlo contra una base remota. Para sembrar Turso: npm run db:seed'
    );
  }

  for (const sufijo of ['', '-wal', '-shm', '-journal']) {
    if (fs.existsSync(RUTA_DB + sufijo)) {
      fs.rmSync(RUTA_DB + sufijo, { force: true });
    }
  }
  console.log('Base de datos anterior borrada.');

  await bd.inicializar();
  const cuantas = await sembrar({ silencioso: true });

  console.log(`Base de datos recreada con ${cuantas} reservas de ejemplo.`);
  bd.cerrar();
}

principal().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
