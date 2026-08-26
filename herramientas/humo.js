// Prueba de humo: ¿está viva la aplicación y llega de verdad a su base?
//
//   npm run humo                             levanta el sistema local y lo interroga
//   npm run humo -- https://algo.vercel.app  interroga una aplicación ya desplegada
//
// La suite de 87 pruebas dice que las reglas del negocio se cumplen. Esto
// contesta otra pregunta, la que el despliegue vuelve interesante: si lo que
// está corriendo allá alcanza su base de datos. Son cosas distintas —una
// aplicación puede responder 200 en la portada y no poder leer una sola
// reserva— y el pipeline necesita las dos.
//
// Contra una aplicación remota solo hace lecturas: no escribe en la base de
// producción.

const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const RAIZ = path.join(__dirname, '..');
const destinoRemoto = process.argv.slice(2).find((a) => a.startsWith('http'));

const comprobaciones = [];

function anotar(nombre, pasa, detalle) {
  comprobaciones.push({ nombre, pasa, detalle });
  console.log(`${pasa ? 'OK   ' : 'FALLA'} ${nombre}${detalle ? `  ${detalle}` : ''}`);
}

// Los despliegues de vista previa de Vercel vienen protegidos: un pedido anónimo
// recibe 200 con la pantalla de autenticación de Vercel en vez de la
// aplicación. Vercel ofrece una llave para que la automatización pase igual, sin
// tener que abrir el despliegue al público.
//
// https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection
const LLAVE_DE_PASO = (process.env.VERCEL_AUTOMATION_BYPASS_SECRET || '').trim();

const CABECERAS = LLAVE_DE_PASO
  ? { 'x-vercel-protection-bypass': LLAVE_DE_PASO, 'x-vercel-set-bypass-cookie': 'true' }
  : {};

// ¿Lo que volvió es la aplicación, o la pantalla de Vercel pidiendo credenciales?
// Se reconoce por las marcas que pone su propio front-end.
function esMuroDeVercel(texto) {
  return (
    /^\s*<!DOCTYPE html/i.test(texto) &&
    /data-dpl-id|Authentication Required|_vercel\/sso|vercel\.com\/sso-api/i.test(texto)
  );
}

async function pedir(base, camino, opciones = {}) {
  const respuesta = await fetch(base + camino, {
    ...opciones,
    headers: { ...CABECERAS, ...(opciones.headers || {}) },
  });
  const texto = await respuesta.text();
  return { estado: respuesta.status, texto };
}

// --- Las comprobaciones ----------------------------------------------------

async function interrogar(base, { escribir }) {
  // 1. La salud: el endpoint que dice si la base contesta.
  const salud = await pedir(base, '/api/health');

  // Antes de leer nada: ¿estamos hablando con la aplicación? Si el despliegue
  // está protegido, todas las rutas contestan 200 con la pantalla de Vercel, y
  // sin este corte la salida serían diez fallas seguidas y un error de JSON que
  // no dice nada sobre la causa.
  if (esMuroDeVercel(salud.texto)) {
    throw new Error(
      'El despliegue está detrás de la protección de Vercel: contesta con su pantalla ' +
      'de autenticación, no con la aplicación. Hay dos caminos:\n\n' +
      '  1. Darle a la automatización una llave de paso, que es lo que Vercel ofrece\n' +
      '     para esto y deja el despliegue protegido para todo lo demás:\n' +
      '       Vercel -> Project Settings -> Deployment Protection\n' +
      '                 -> Protection Bypass for Automation -> generar la llave\n' +
      '       gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo jcyanez/cancha-total-f5\n\n' +
      '  2. Apagar la protección de las vistas previas, que las deja públicas:\n' +
      '       Vercel -> Project Settings -> Deployment Protection\n' +
      '                 -> Vercel Authentication -> desactivar\n\n' +
      (LLAVE_DE_PASO
        ? '  Hay una llave configurada, pero Vercel no la aceptó: revisá que sea la\n' +
          '  del proyecto correcto y que no se haya regenerado después de guardarla.'
        : '  No hay ninguna llave configurada en este momento.')
    );
  }

  let cuerpo = {};
  try {
    cuerpo = JSON.parse(salud.texto);
  } catch {
    anotar('/api/health devuelve JSON', false, salud.texto.slice(0, 160));
  }

  anotar('/api/health responde 200', salud.estado === 200, `estado=${salud.estado}`);
  anotar("/api/health dice status 'ok'", cuerpo.status === 'ok', `status=${cuerpo.status}`);
  anotar(
    "/api/health dice database 'connected'",
    cuerpo.database === 'connected',
    `backend=${cuerpo.backend} reservas=${cuerpo.reservas}`
  );

  // Una aplicación desplegada tiene que estar hablando con Turso, no con un
  // archivo. Un archivo en una función serverless vive en /tmp, es distinto en
  // cada instancia y se borra: la aplicación contestaría 200 y perdería cada
  // reserva. Sin esta comprobación, ese despliegue pasaría por bueno.
  if (!escribir) {
    anotar(
      'la aplicación desplegada usa Turso, no un archivo',
      cuerpo.backend === 'turso',
      `backend=${cuerpo.backend}`
    );
  }

  // El endpoint no debe filtrar credenciales ni la URL de la base.
  const crudo = salud.texto;
  const filtra = /libsql:|authToken|eyJ|turso\.io|\.turso\./i.test(crudo);
  anotar('/api/health no filtra URL ni token', !filtra, filtra ? 'HAY UNA FUGA' : '');

  // 2. La portada: se renderiza y trae la grilla.
  const inicio = await pedir(base, '/');
  anotar('la portada responde 200', inicio.estado === 200, `estado=${inicio.estado}`);
  anotar('la portada trae la marca', inicio.texto.includes('Cancha Total F5'));
  anotar('la portada trae la grilla de bloques', inicio.texto.includes('<td>8:00</td>'));

  // 3. Una lectura que obliga a consultar la base: la lista de un día.
  const dia = await pedir(base, '/dia/2026-01-01');
  anotar('la lista del día consulta la base', dia.estado === 200 && dia.texto.includes('Reservas del'));

  // 4. La cotización, que es la ruta que usa el formulario por fetch.
  const cotizacion = await pedir(base, '/api/cotizar?hora=17');
  const precio = JSON.parse(cotizacion.texto).precio;
  anotar('/api/cotizar cotiza el bloque con luz', precio === 20000, `precio=${precio}`);

  // 5. Solo en local: una escritura completa, ida y vuelta.
  if (escribir) {
    const campos = new URLSearchParams({
      cancha: '1', fecha: '2030-06-15', hora: '16',
      cliente: 'Prueba de Humo', telefono: '88880000',
    });
    const alta = await pedir(base, '/reservas', { method: 'POST', body: campos });
    anotar('se puede registrar una reserva', alta.estado === 200 && alta.texto.includes('creada.'));

    const lista = await pedir(base, '/dia/2030-06-15');
    anotar('la reserva quedó guardada y se lee', lista.texto.includes('Prueba de Humo'));
  }
}

// --- Arranque local --------------------------------------------------------

function levantarLocal(base) {
  return new Promise((resolver, rechazar) => {
    const proceso = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
      cwd: RAIZ,
      env: { ...process.env, CANCHA_PUERTO: '0', CANCHA_BD: base, TURSO_DATABASE_URL: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let salida = '';
    let error = '';
    const limite = setTimeout(
      () => rechazar(new Error(`el sistema no arrancó en 20 s\n${salida}\n${error}`)),
      20000
    );
    proceso.stdout.on('data', (t) => {
      salida += t;
      const encontrado = salida.match(/escuchando en el puerto (\d+)/);
      if (encontrado) {
        clearTimeout(limite);
        resolver({ proceso, direccion: `http://127.0.0.1:${encontrado[1]}` });
      }
    });
    proceso.stderr.on('data', (t) => { error += t; });
    proceso.once('exit', (codigo) => {
      clearTimeout(limite);
      rechazar(new Error(`el sistema terminó con código ${codigo}\n${salida}\n${error}`));
    });
  });
}

async function principal() {
  if (destinoRemoto) {
    const direccion = destinoRemoto.replace(/\/+$/, '');
    console.log(`Interrogando la aplicación desplegada: ${direccion}\n`);
    await interrogar(direccion, { escribir: false });
  } else {
    const archivo = path.join(os.tmpdir(), `humo-${process.pid}.db`);
    console.log('Interrogando el sistema local sobre una base recién creada.\n');
    const local = await levantarLocal(archivo);
    try {
      await interrogar(local.direccion, { escribir: true });
    } finally {
      local.proceso.kill();
      setTimeout(() => {
        for (const sufijo of ['', '-wal', '-shm', '-journal']) {
          try { fs.rmSync(archivo + sufijo, { force: true }); } catch { /* Windows retiene el handle */ }
        }
      }, 300);
    }
  }

  const fallidas = comprobaciones.filter((c) => !c.pasa);
  console.log(`\n${comprobaciones.length - fallidas.length}/${comprobaciones.length} comprobaciones pasaron.`);

  if (fallidas.length > 0) {
    console.error(`\nLa prueba de humo falló en ${fallidas.length}:`);
    for (const f of fallidas) console.error(`  - ${f.nombre}`);
  }

  return fallidas.length;
}

// El código de salida se decide acá y no dentro de principal(): asignar
// process.exitCode después de un await deja al linter avisando de una condición
// de carrera, y tiene razón en avisar. Devolver el número y decidir afuera es
// más simple de leer, además.
principal().then(
  (cuantasFallaron) => {
    process.exitCode = cuantasFallaron > 0 ? 1 : 0;
  },
  (error) => {
    console.error(`La prueba de humo no pudo correr: ${error.message}`);
    process.exitCode = 1;
  }
);
