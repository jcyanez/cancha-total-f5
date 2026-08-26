// Tarifas — RN-18, RN-19, RN-20 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: la tarifa no vive en una función propia que se
// pueda llamar; está calculada dentro de tres manejadores de peticiones
// distintos (hallazgo E-5). Se comprueba donde el negocio la ve: la cotización
// previa, el precio que queda guardado y la tarifa que muestra la pantalla.
// Al ser de integración, estas pruebas siguen valiendo cuando la tarifa se
// unifique en un solo lugar, que es justo lo que la refactorización va a hacer.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema, tarifaMostrada } = require('./soporte/servidor.js');

test('la hora de las 8:00 cuesta 15.000', async () => {
  // Falla si: cambia la tarifa diurna o el primer bloque deja de ser diurno.
  await conSistema(async (sistema) => {
    const cotizacion = await sistema.cotizar(8);
    assert.equal(cotizacion.precio, 15000);
  });
});

test('la hora de las 16:00 cuesta 15.000, es el último bloque sin luz', async () => {
  // Falla si: el borde entre tarifa diurna y tarifa con luz se corre a las 16:00.
  await conSistema(async (sistema) => {
    const cotizacion = await sistema.cotizar(16);
    assert.equal(cotizacion.precio, 15000);
  });
});

test('la hora de las 17:00 cuesta 20.000 porque la luz ya está encendida', async () => {
  // Falla si: el borde de la tarifa con luz no está en las 17:00.
  await conSistema(async (sistema) => {
    const cotizacion = await sistema.cotizar(17);
    assert.equal(cotizacion.precio, 20000);
  });
});

test('la hora de las 21:00 cuesta 20.000', async () => {
  // Falla si: cambia la tarifa con luz o el último bloque deja de tenerla.
  await conSistema(async (sistema) => {
    const cotizacion = await sistema.cotizar(21);
    assert.equal(cotizacion.precio, 20000);
  });
});

test('una reserva de las 17:00 queda cobrada a 20.000', async () => {
  // Falla si: el precio que se guarda para el bloque de las 17:00 no es el de
  // la hora con luz.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 17, cliente: 'Ana Vargas', telefono: '88112233',
    });
    assert.equal(sistema.ultimaReserva().precio, 20000);
  });
});

test('una reserva de las 16:00 queda cobrada a 15.000', async () => {
  // Falla si: el precio guardado para un bloque diurno deja de ser la tarifa diurna.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 16, cliente: 'Ana Vargas', telefono: '88112233',
    });
    assert.equal(sistema.ultimaReserva().precio, 15000);
  });
});

test('la pantalla de disponibilidad muestra 20.000 en el bloque de las 17:00', async () => {
  // Falla si: la tarifa que se le muestra al cliente en la grilla no coincide
  // con la tarifa con luz.
  await conSistema(async (sistema) => {
    const pantalla = await sistema.inicio('2026-09-10');
    assert.equal(tarifaMostrada(pantalla, 17), 20000);
  });
});

test('la pantalla de disponibilidad muestra 15.000 en el bloque de las 16:00', async () => {
  // Falla si: la grilla deja de mostrar la tarifa diurna en los bloques diurnos.
  await conSistema(async (sistema) => {
    const pantalla = await sistema.inicio('2026-09-10');
    assert.equal(tarifaMostrada(pantalla, 16), 15000);
  });
});

test('la tarifa que se muestra y la que se cobra son la misma', async () => {
  // Falla si: la grilla y el registro de la reserva calculan el precio distinto
  // para el mismo bloque. Es la prueba que ata entre sí los tres lugares donde
  // hoy se calcula la tarifa (hallazgo E-5).
  await conSistema(async (sistema) => {
    const pantalla = await sistema.inicio('2026-09-11');
    const mostrada = tarifaMostrada(pantalla, 19);
    const cotizada = (await sistema.cotizar(19)).precio;

    await sistema.reservar({
      cancha: 1, fecha: '2026-09-11', hora: 19, cliente: 'Ana Vargas', telefono: '88112233',
    });
    const cobrada = sistema.ultimaReserva().precio;

    assert.equal(mostrada, cotizada);
    assert.equal(mostrada, cobrada);
  });
});
