// Andamiaje de pruebas. NO forma parte del sistema: se carga con --require
// delante de server.js y nunca se ejecuta en producción.
//
// Existe porque server.js no se puede probar tal como está (ver HALLAZGOS.md,
// hallazgos de estructura E-1, E-2 y E-3): arranca al cargarse, fija el puerto,
// fija la ruta de la base de datos y lee el reloj del sistema desde adentro de
// una regla de negocio. Este archivo redirige esas tres cosas desde afuera sin
// modificar una sola línea del sistema.
//
// No cambia ninguna regla: ni tarifas, ni descuentos, ni plazos, ni validaciones.

// --- 1. Reloj congelado ---------------------------------------------------
// La regla de cancelación (RN-27, RN-28) depende de "ahora". Una prueba que
// dependa del reloj real falla sola con el paso de los días, así que el
// instante se fija desde la prueba.
if (process.env.PRUEBAS_AHORA) {
  const instanteFijo = new Date(process.env.PRUEBAS_AHORA).getTime();
  const FechaReal = Date;

  class FechaCongelada extends FechaReal {
    constructor(...argumentos) {
      if (argumentos.length === 0) {
        super(instanteFijo);
      } else {
        super(...argumentos);
      }
    }
    static now() {
      return instanteFijo;
    }
  }

  globalThis.Date = FechaCongelada;
}

// --- 2. Base de datos aislada ---------------------------------------------
// server.js abre siempre la misma ruta. Cada prueba necesita su propia base,
// creada por ella y desechada al terminar, para no depender del orden ni de
// haber corrido `npm run datos`.
if (process.env.PRUEBAS_BD) {
  const Modulo = require('module');
  const cargarOriginal = Modulo._load;

  Modulo._load = function (peticion, ...resto) {
    const exportado = cargarOriginal.call(this, peticion, ...resto);
    if (peticion !== 'better-sqlite3') {
      return exportado;
    }
    return function BaseDeDatosRedirigida(_rutaIgnorada, opciones) {
      return new exportado(process.env.PRUEBAS_BD, opciones);
    };
  };
}

// --- 3. Puerto libre ------------------------------------------------------
// El puerto está fijo en 3000. Se pide uno efímero al sistema operativo y se
// anuncia por la salida estándar para que la prueba sepa a dónde hablar.
const http = require('http');
const escucharOriginal = http.Server.prototype.listen;

http.Server.prototype.listen = function (...argumentos) {
  if (typeof argumentos[0] === 'number') {
    argumentos[0] = 0;
  }
  const servidor = escucharOriginal.apply(this, argumentos);
  servidor.once('listening', () => {
    process.stdout.write(`\n__PUERTO_DE_PRUEBAS__=${servidor.address().port}\n`);
  });
  return servidor;
};
