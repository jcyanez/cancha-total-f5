// Reglas del negocio, en unidad — RN-18 a RN-20, RN-21 y RN-25, RN-27 y RN-28
//
// NIVEL: unidad. Razón: son las tres reglas del sistema que tienen lógica
// propia y casos borde —la tarifa, el descuento de frecuente y el plazo de
// cancelación— y las tres viven ahora en funciones puras: se les pasa todo lo
// que necesitan y devuelven un valor. No tocan la base, ni el reloj, ni la red.
//
// Estas pruebas no existían porque no podían existir: el sistema arrancaba al
// cargarse y no exportaba nada (hallazgo E-1). Se escriben ahora que esa deuda
// está pagada.
//
// No reemplazan a las de integración: aquéllas comprueban que la regla llega
// bien hasta la pantalla y hasta la base; éstas, que la regla misma acierta en
// sus bordes, que es donde se equivocan las reglas.

const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

// El sistema abre su base al cargarse; se le da una propia y desechable para no
// tocar la de nadie.
process.env.CANCHA_BD = path.join(os.tmpdir(), `cancha-total-unidad-${process.pid}.db`);

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { tarifaDelBloque, precioConDescuento, horasHastaElPartido } = require('../server.js');

after(() => {
  for (const sufijo of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.rmSync(process.env.CANCHA_BD + sufijo, { force: true });
    } catch {
      // En Windows el archivo puede seguir tomado un instante; vive en el
      // directorio temporal y no es un fallo de la prueba.
    }
  }
});

// --- Tarifa del bloque — RN-18, RN-19, RN-20 --------------------------------

test('la tarifa diurna vale desde el primer bloque del día', () => {
  // Falla si: cambia la tarifa diurna o el día deja de empezar a las 8:00.
  assert.equal(tarifaDelBloque(8), 15000);
});

test('las 16:00 son el último bloque sin luz', () => {
  // Falla si: el borde de la tarifa con luz se corre hacia atrás.
  assert.equal(tarifaDelBloque(16), 15000);
});

test('las 17:00 son el primer bloque con luz', () => {
  // Falla si: el borde de la tarifa con luz se corre hacia adelante. Es el
  // borde exacto que la administradora corrigió (hallazgo C-1).
  assert.equal(tarifaDelBloque(17), 20000);
});

test('la tarifa con luz vale hasta el último bloque del día', () => {
  // Falla si: cambia la tarifa con luz o el día deja de terminar a las 21:00.
  assert.equal(tarifaDelBloque(21), 20000);
});

test('el salto de tarifa ocurre una sola vez en el día', () => {
  // Falla si: aparece un tercer precio, o el precio deja de ser creciente con
  // la hora. Recorre los catorce bloques y cuenta los saltos.
  const precios = [];
  for (let hora = 8; hora <= 21; hora++) precios.push(tarifaDelBloque(hora));

  const saltos = precios.filter((precio, i) => i > 0 && precio !== precios[i - 1]);
  assert.equal(saltos.length, 1);
  assert.deepEqual([...new Set(precios)], [15000, 20000]);
});

// --- Descuento de cliente frecuente — RN-21, RN-25 --------------------------
//
// El argumento son las reservas que el cliente YA lleva en el mes; la que está
// haciendo no viene contada.

test('la primera reserva del mes no lleva descuento', () => {
  // Falla si: el descuento se aplica sin haber llegado al umbral.
  assert.equal(precioConDescuento(15000, 0), 15000);
});

test('la tercera reserva del mes todavía no lleva descuento', () => {
  // Falla si: el umbral de cliente frecuente baja de cuatro.
  assert.equal(precioConDescuento(15000, 2), 15000);
});

test('la cuarta reserva del mes lleva 10% de descuento', () => {
  // Falla si: el umbral sube de cuatro, o cambia el porcentaje. Es el borde
  // exacto: con tres reservas previas, la que se está haciendo es la cuarta.
  assert.equal(precioConDescuento(15000, 3), 13500);
});

test('el descuento se aplica también sobre la tarifa con luz', () => {
  // Falla si: el descuento se calcula sobre un precio fijo en vez de sobre la
  // tarifa del bloque.
  assert.equal(precioConDescuento(20000, 3), 18000);
});

test('el descuento no se acumula por reservar de más', () => {
  // Falla si: el descuento crece con la cantidad de reservas del mes. Son 10%,
  // no 10% por reserva.
  assert.equal(precioConDescuento(15000, 20), 13500);
});

// --- Plazo de cancelación — RN-27, RN-28 ------------------------------------

test('faltando exactamente 24 horas, el plazo está justo en el límite', () => {
  // Falla si: la cuenta de horas hasta el partido se corre. Es el borde que
  // decide si una cancelación se acepta o no.
  const ahora = new Date('2026-08-18T10:00:00');
  assert.equal(horasHastaElPartido({ fecha: '2026-08-19', hora: 10 }, ahora), 24);
});

test('el partido de mañana temprano queda dentro de las 24 horas', () => {
  // Falla si: el plazo se mide en días de calendario en vez de en horas. Es el
  // caso que describió la administradora (hallazgo C-5): son 22 horas, no un
  // día entero.
  const ahora = new Date('2026-08-18T10:00:00');
  assert.equal(horasHastaElPartido({ fecha: '2026-08-19', hora: 8 }, ahora), 22);
});

test('un partido de más tarde el mismo día deja pocas horas', () => {
  // Falla si: la hora del partido deja de contar y solo se mira la fecha.
  const ahora = new Date('2026-08-18T10:00:00');
  assert.equal(horasHastaElPartido({ fecha: '2026-08-18', hora: 21 }, ahora), 11);
});

test('un partido que ya pasó da horas negativas', () => {
  // Falla si: la cuenta usa el valor absoluto y confunde pasado con futuro.
  const ahora = new Date('2026-08-18T10:00:00');
  assert.equal(horasHastaElPartido({ fecha: '2026-08-17', hora: 10 }, ahora), -24);
});

test('la hora del partido se lee como hora local, no como UTC', () => {
  // Falla si: se arma el instante del partido con una Z o con un desfase, y el
  // plazo queda corrido por las horas de diferencia con UTC. Con el reloj y el
  // partido a la misma hora del mismo día, faltan cero horas.
  const ahora = new Date('2026-08-18T15:00:00');
  assert.equal(horasHastaElPartido({ fecha: '2026-08-18', hora: 15 }, ahora), 0);
});
