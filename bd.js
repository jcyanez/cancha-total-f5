// Acceso a datos. El único lugar del sistema que sabe con qué base habla.
//
// Un solo driver —@libsql/client— para las dos situaciones, y ese es el punto:
// el camino que ejercitan las pruebas es el mismo que corre en producción.
//
//   Sin TURSO_DATABASE_URL  ->  archivo SQLite local (file:reservas.db)
//   Con  TURSO_DATABASE_URL ->  Turso, por HTTP, con TURSO_AUTH_TOKEN
//
// libSQL es SQLite: el esquema y todo el SQL del sistema —COUNT(*), substr(),
// AUTOINCREMENT, datetime('now')— valen igual en los dos lados. Lo que cambia
// es la firma, no el dialecto: better-sqlite3 era síncrono y esto es asíncrono.

const fs = require('node:fs');
const path = require('node:path');

const RUTA_MIGRACIONES = path.join(__dirname, 'database', 'migrations');

// Esquemas que viajan por red. Los demás son archivos en disco.
const ES_REMOTA = /^(libsql|https?|wss?):/i;

// Un servidor libSQL local (sqld, `turso dev`) habla HTTP pero no pide token.
const ES_LOCALHOST = /^(https?|wss?):\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i;

let cliente = null;
let inicializacion = null;

// --- Configuración ---------------------------------------------------------

// URL de la base, ya normalizada a algo que createClient() acepta.
// En Windows `file:C:\...\reservas.db` funciona tal cual: verificado.
//
// El orden de precedencia importa, y es este:
//
//   1. CANCHA_BD          un archivo nombrado explícitamente
//   2. TURSO_DATABASE_URL la base remota
//   3. ./reservas.db      el archivo de siempre
//
// CANCHA_BD gana sobre Turso a propósito. Quien nombra un archivo concreto
// está pidiendo ese archivo, y quien lo hace siempre es el arnés de pruebas:
// las 87 pruebas levantan el sistema con CANCHA_BD apuntando a un archivo
// temporal. Si Turso ganara, bastaría con tener TURSO_DATABASE_URL exportada
// en la terminal para que `npm test` escribiera —y borrara— en la base de
// producción. Con este orden eso no puede pasar.
function urlDeLaBase() {
  const local = (process.env.CANCHA_BD || '').trim();
  if (local) return local.startsWith('file:') ? local : `file:${local}`;

  const remota = (process.env.TURSO_DATABASE_URL || '').trim();
  if (remota) return remota;

  return `file:${path.join(__dirname, 'reservas.db')}`;
}

function esRemota(url = urlDeLaBase()) {
  return ES_REMOTA.test(url);
}

// Etiqueta para diagnósticos y para /api/health. Nunca incluye la URL ni el
// token: solo dice contra qué clase de base está hablando el sistema.
function descripcionDeLaBase() {
  return esRemota() ? 'turso' : 'archivo-local';
}

// Falla temprano y con un mensaje que se entiende. Nombra la variable que
// falta; jamás su valor.
function revisarConfiguracion() {
  const url = urlDeLaBase();

  if (esRemota(url) && !ES_LOCALHOST.test(url) && !(process.env.TURSO_AUTH_TOKEN || '').trim()) {
    throw new Error(
      'TURSO_DATABASE_URL apunta a una base remota pero falta TURSO_AUTH_TOKEN. ' +
      'Configurá las dos variables juntas (mirá .env.example).'
    );
  }

  if (!esRemota(url) && (process.env.TURSO_DATABASE_URL || '').trim()) {
    // Las dos definidas y ganó la local. Es lo correcto y es lo que quieren las
    // pruebas, pero si esto aparece en un servidor desplegado significa que
    // CANCHA_BD quedó puesta por error y los datos están yendo a un archivo
    // efímero en vez de a Turso. Que se vea.
    console.warn(
      '[bd] CANCHA_BD y TURSO_DATABASE_URL están las dos definidas: ' +
      'manda CANCHA_BD, así que el sistema NO está usando Turso.'
    );
  }

  if (!esRemota(url) && (process.env.TURSO_AUTH_TOKEN || '').trim()) {
    console.warn(
      '[bd] Hay TURSO_AUTH_TOKEN pero la base en uso es local: ' +
      'el token no se está usando para nada.'
    );
  }

  return url;
}

// --- Cliente ---------------------------------------------------------------

// El import importa. `@libsql/client/web` es HTTP puro, sin binding nativo:
// es el que sobrevive en una función serverless de Vercel. El import normal
// trae el binding nativo, que hace falta —y solo hace falta— para abrir un
// archivo en disco.
function crearCliente(opciones) {
  if (esRemota(opciones.url)) {
    return require('@libsql/client/web').createClient(opciones);
  }
  return require('@libsql/client').createClient(opciones);
}

function obtenerCliente() {
  if (cliente) return cliente;

  const url = revisarConfiguracion();
  const opciones = { url };

  const token = (process.env.TURSO_AUTH_TOKEN || '').trim();
  if (token && esRemota(url)) opciones.authToken = token;

  try {
    cliente = crearCliente(opciones);
  } catch (causa) {
    // El mensaje del driver puede traer la URL adentro. No lo propagamos.
    throw new Error(
      `No se pudo abrir la base de datos (${descripcionDeLaBase()}). ` +
      `Revisá TURSO_DATABASE_URL y TURSO_AUTH_TOKEN. Detalle: ${causa.code || causa.name}`
    );
  }

  return cliente;
}

// --- Esquema ---------------------------------------------------------------

// Las migraciones, en orden y con su nombre. El nombre del archivo es la
// versión: 001, 002, ... y así se leen ordenadas por sí solas.
function migracionesDisponibles() {
  if (!fs.existsSync(RUTA_MIGRACIONES)) return [];
  return fs
    .readdirSync(RUTA_MIGRACIONES)
    .filter((n) => n.endsWith('.sql'))
    .sort()
    .map((nombre) => ({
      nombre,
      sql: fs.readFileSync(path.join(RUTA_MIGRACIONES, nombre), 'utf8'),
    }));
}

// Corre las migraciones que falten. Idempotente: se puede invocar en cada
// arranque sin consecuencias, y eso es justamente lo que hace el servidor.
// No borra nada: ninguna migración lleva DROP.
async function migrar({ registrar = () => {} } = {}) {
  const c = obtenerCliente();

  await c.execute(`
    CREATE TABLE IF NOT EXISTS migraciones (
      nombre TEXT PRIMARY KEY,
      aplicada_en TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const yaAplicadas = new Set(
    (await c.execute('SELECT nombre FROM migraciones')).rows.map((f) => f.nombre)
  );

  const aplicadas = [];
  for (const migracion of migracionesDisponibles()) {
    if (yaAplicadas.has(migracion.nombre)) {
      registrar(`  ya estaba: ${migracion.nombre}`);
      continue;
    }

    // Una migración puede traer varias sentencias. Se separan por ';' y se
    // corren una por una: el protocolo remoto no acepta lotes en execute().
    for (const sentencia of separarSentencias(migracion.sql)) {
      await c.execute(sentencia);
    }

    await c.execute({
      sql: 'INSERT INTO migraciones (nombre) VALUES (?)',
      args: [migracion.nombre],
    });
    aplicadas.push(migracion.nombre);
    registrar(`  aplicada:  ${migracion.nombre}`);
  }

  return aplicadas;
}

// Parte un archivo .sql en sentencias.
//
// No sirve partir por ';' y después quitar los comentarios: un comentario puede
// contener un ';' —los de estas migraciones lo contienen— y entonces la mitad
// de una frase en castellano llega al motor como si fuera SQL. Hay que ir
// carácter por carácter, sabiendo cuándo estamos dentro de un comentario y
// cuándo dentro de un literal de texto.
function separarSentencias(sql) {
  const sentencias = [];
  let actual = '';
  let enTexto = false; // dentro de '...'
  let i = 0;

  while (i < sql.length) {
    const c = sql[i];

    if (enTexto) {
      actual += c;
      if (c === "'") enTexto = false;
      i += 1;
      continue;
    }

    if (c === "'") {
      enTexto = true;
      actual += c;
      i += 1;
      continue;
    }

    // Comentario de línea: se descarta hasta el fin de línea.
    if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i += 1;
      continue;
    }

    if (c === ';') {
      sentencias.push(actual);
      actual = '';
      i += 1;
      continue;
    }

    actual += c;
    i += 1;
  }

  sentencias.push(actual);

  return sentencias.map((s) => s.trim()).filter((s) => s.length > 0);
}

// Deja la base lista, una sola vez por proceso. En Vercel cada arranque en
// frío pasa por acá; las migraciones son idempotentes, así que no molesta.
function inicializar() {
  if (!inicializacion) {
    inicializacion = migrar().catch((causa) => {
      inicializacion = null; // que el próximo intento pueda volver a probar
      throw causa;
    });
  }
  return inicializacion;
}

// --- Consultas -------------------------------------------------------------
//
// Tres verbos, los mismos que usaba el sistema con better-sqlite3:
//   consultarUno  <-  .get()
//   consultar     <-  .all()
//   ejecutar      <-  .run()

async function consultar(sql, args = []) {
  const resultado = await obtenerCliente().execute({ sql, args });
  // Las filas de libSQL son objetos con propiedades de más (índices
  // numéricos). Se copian a objetos planos para que el resto del sistema las
  // trate como las trataba antes.
  return resultado.rows.map((fila) => ({ ...fila }));
}

async function consultarUno(sql, args = []) {
  const filas = await consultar(sql, args);
  return filas[0];
}

async function ejecutar(sql, args = []) {
  const resultado = await obtenerCliente().execute({ sql, args });
  return {
    filasAfectadas: resultado.rowsAffected,
    // lastInsertRowid llega como BigInt. El sistema lo usa como número
    // (el "#12" de la confirmación), así que se convierte acá y no allá.
    ultimoId:
      resultado.lastInsertRowid === undefined || resultado.lastInsertRowid === null
        ? null
        : Number(resultado.lastInsertRowid),
  };
}

// Comprobación de vida para /api/health: una lectura barata y real.
async function comprobarConexion() {
  await obtenerCliente().execute('SELECT 1');
  return true;
}

function cerrar() {
  if (cliente) {
    cliente.close();
    cliente = null;
    inicializacion = null;
  }
}

module.exports = {
  consultar,
  consultarUno,
  ejecutar,
  inicializar,
  migrar,
  comprobarConexion,
  descripcionDeLaBase,
  esRemota,
  urlDeLaBase,
  cerrar,
};
