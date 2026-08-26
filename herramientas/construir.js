// Verificación del artefacto desplegable.  npm run build
//
// Este proyecto no transpila nada: no hay bundler, no hay TypeScript, no hay
// carpeta dist/. Poner un `build` que no haga nada para llenar una casilla del
// pipeline sería mentir, así que este script hace lo que en un proyecto sin
// compilación sí se puede romper de verdad:
//
//   1. Todo archivo que viaja al servidor parsea.
//   2. Ningún archivo de tiempo de ejecución depende de una devDependency.
//   3. El punto de entrada serverless carga y exporta una aplicación Express.
//
// El punto 2 es el que justifica el script. better-sqlite3 es un módulo nativo
// que quedó como devDependency —lo usa el arnés de pruebas, no el sistema—, y
// en Vercel el runtime puede no tenerlo. Si alguien vuelve a escribir
// `require('better-sqlite3')` dentro de server.js, localmente funciona y en
// producción el despliegue arranca roto. Esto lo detiene antes.
//
// El build de verdad, el que produce el paquete que se sube, lo corre Vercel
// (`vercel build`) en el workflow de despliegue. Este es su antesala.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const modulosNativos = require('node:module').builtinModules;

const RAIZ = path.join(__dirname, '..');
const paquete = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));

const DEPENDENCIAS = new Set(Object.keys(paquete.dependencies || {}));
const DEPENDENCIAS_DE_DESARROLLO = new Set(Object.keys(paquete.devDependencies || {}));
const NATIVOS = new Set(modulosNativos);

// Lo que viaja al servidor. Todo lo demás —pruebas, herramientas, database/—
// se queda en el repositorio o corre solo en la máquina de quien desarrolla.
const ARCHIVOS_DE_EJECUCION = ['server.js', 'bd.js', path.join('api', 'index.js')];

const problemas = [];

// Anuncia el resultado de una etapa. Si la etapa encontró problemas, no dice
// que salió bien: cuenta cuántos encontró. Un resumen que dice «sin fugas»
// arriba de la lista de fugas es peor que no decir nada.
function etapa(numero, nombre, resumen, problemasAntes) {
  const nuevos = problemas.length - problemasAntes;
  const cola = nuevos === 0 ? resumen : `${nuevos} problema(s).`;
  console.log(`${numero}. ${nombre}:  ${cola}`);
}

// --- 1. Todo parsea --------------------------------------------------------

function archivosJS(directorio, acumulado = []) {
  for (const entrada of fs.readdirSync(directorio, { withFileTypes: true })) {
    if (entrada.name === 'node_modules' || entrada.name === '.git') continue;
    const completo = path.join(directorio, entrada.name);
    if (entrada.isDirectory()) archivosJS(completo, acumulado);
    else if (entrada.name.endsWith('.js')) acumulado.push(completo);
  }
  return acumulado;
}

let antes = problemas.length;
const todos = archivosJS(RAIZ);
for (const archivo of todos) {
  try {
    execFileSync(process.execPath, ['--check', archivo], { stdio: 'pipe' });
  } catch (error) {
    problemas.push(`no parsea: ${path.relative(RAIZ, archivo)}\n${error.stderr}`);
  }
}
etapa(1, 'Parseo', `${todos.length} archivos .js revisados.`, antes);

// --- 2. Las dependencias de ejecución están declaradas como tales ----------

// Extrae los require() de un archivo. No es un analizador de JavaScript: es una
// expresión regular, y alcanza porque este código escribe los require con una
// cadena literal, siempre.
function especificadoresRequeridos(codigo) {
  const encontrados = new Set();
  const patron = /require\(\s*(['"])([^'"]+)\1\s*\)/g;
  let coincidencia;
  while ((coincidencia = patron.exec(codigo)) !== null) {
    encontrados.add(coincidencia[2]);
  }
  return encontrados;
}

function paqueteDe(especificador) {
  const partes = especificador.split('/');
  return especificador.startsWith('@') ? partes.slice(0, 2).join('/') : partes[0];
}

antes = problemas.length;
for (const relativo of ARCHIVOS_DE_EJECUCION) {
  const completo = path.join(RAIZ, relativo);
  if (!fs.existsSync(completo)) {
    problemas.push(`falta un archivo de ejecución: ${relativo}`);
    continue;
  }
  for (const especificador of especificadoresRequeridos(fs.readFileSync(completo, 'utf8'))) {
    if (especificador.startsWith('.') || especificador.startsWith('/')) continue;
    if (especificador.startsWith('node:')) continue;

    const nombre = paqueteDe(especificador);
    if (NATIVOS.has(nombre)) continue;
    if (DEPENDENCIAS.has(nombre)) continue;

    if (DEPENDENCIAS_DE_DESARROLLO.has(nombre)) {
      problemas.push(
        `${relativo} requiere "${especificador}", que está en devDependencies. ` +
        `En producción puede no estar instalado: movelo a dependencies o dejá de usarlo ahí.`
      );
    } else {
      problemas.push(`${relativo} requiere "${especificador}", que no está declarado en package.json.`);
    }
  }
}
etapa(2, 'Dependencias', `${ARCHIVOS_DE_EJECUCION.length} archivos de ejecución sin fugas a devDependencies.`, antes);

// --- 3. El punto de entrada serverless carga ------------------------------

antes = problemas.length;
try {
  const entrada = require(path.join(RAIZ, 'api', 'index.js'));
  const manejador = entrada && (entrada.default || entrada);
  if (typeof manejador !== 'function') {
    problemas.push('api/index.js no exporta una función: Vercel no tendría a quién invocar.');
  }
} catch (error) {
  problemas.push(`api/index.js no se pudo cargar: ${error.message}`);
}
etapa(3, 'Entrada serverless', 'api/index.js carga y exporta una aplicación.', antes);

// --- Veredicto -------------------------------------------------------------

if (problemas.length > 0) {
  console.error(`\nEl artefacto no está listo. ${problemas.length} problema(s):\n`);
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

console.log('\nArtefacto verificado: el sistema puede desplegarse.');
process.exit(0);
