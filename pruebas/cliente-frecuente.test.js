// Cliente frecuente — RN-21 a RN-26 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: el conteo de reservas del mes y el descuento
// viven dentro del manejador que registra la reserva y consultan la base de
// datos; no hay una función de descuento que se pueda llamar (hallazgo E-1).
// El efecto observable es el precio que queda guardado, y eso es lo que se
// comprueba.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema } = require('./soporte/servidor.js');

const TELEFONO = '88112233';

// Registra `cantidad` reservas del mismo cliente, una por día, a la misma hora.
async function registrarVarias(sistema, { cantidad, desdeDia, mes = '09', hora = 10, telefono = TELEFONO }) {
  for (let i = 0; i < cantidad; i += 1) {
    const dia = String(desdeDia + i).padStart(2, '0');
    await sistema.reservar({
      cancha: 1, fecha: `2026-${mes}-${dia}`, hora, cliente: 'Marco Jiménez', telefono,
    });
  }
}

test('la cuarta reserva del mes lleva 10% de descuento', async () => {
  // Falla si: cambia el umbral de cliente frecuente o el porcentaje del descuento.
  await conSistema(async (sistema) => {
    await registrarVarias(sistema, { cantidad: 3, desdeDia: 1 });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });
    assert.equal(sistema.ultimaReserva().precio, 13500);
  });
});

test('la tercera reserva del mes todavía no lleva descuento', async () => {
  // Falla si: el umbral baja de cuatro reservas.
  await conSistema(async (sistema) => {
    await registrarVarias(sistema, { cantidad: 2, desdeDia: 1 });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-03', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });
    assert.equal(sistema.ultimaReserva().precio, 15000);
  });
});

test('el descuento se aplica sobre la tarifa con luz', async () => {
  // Falla si: el descuento deja de calcularse sobre la tarifa del bloque.
  await conSistema(async (sistema) => {
    await registrarVarias(sistema, { cantidad: 3, desdeDia: 1, hora: 19 });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 19, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });
    assert.equal(sistema.ultimaReserva().precio, 18000);
  });
});

test('el cliente se reconoce por el teléfono, no por el nombre', async () => {
  // Falla si: el conteo del mes se hace por nombre o por número de reserva.
  await conSistema(async (sistema) => {
    for (const [dia, nombre] of [['01', 'Marco J.'], ['02', 'marco jimenez'], ['03', 'M. Jiménez']]) {
      await sistema.reservar({
        cancha: 1, fecha: `2026-09-${dia}`, hora: 10, cliente: nombre, telefono: TELEFONO,
      });
    }
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });
    assert.equal(sistema.ultimaReserva().precio, 13500);
  });
});

test('una reserva cancelada no cuenta para volverse cliente frecuente', async () => {
  // Falla si: el conteo del mes deja de excluir las reservas canceladas.
  await conSistema(async (sistema) => {
    await registrarVarias(sistema, { cantidad: 3, desdeDia: 1 });

    const cancelada = sistema.reservas()[1];
    await sistema.cancelar(cancelada.id);

    await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });

    // Quedan dos reservas en pie más la que se está haciendo: son tres, no cuatro.
    assert.equal(sistema.ultimaReserva().precio, 15000);
  });
});

test('el mes que cuenta es aquel en que se hizo la reserva, no aquel en que se juega', { todo: 'HALLAZGO C-4' }, async () => {
  // Falla si: el conteo del mes se hace sobre la fecha del partido en lugar de
  // sobre la fecha en que se registró la reserva.
  await conSistema(async (sistema) => {
    // Tres partidos de octubre, apartados hoy.
    await registrarVarias(sistema, { cantidad: 3, desdeDia: 1, mes: '10' });

    // Un cuarto partido, para setiembre, apartado también hoy.
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-15', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });

    // Son cuatro reservas hechas este mes: corresponde el descuento.
    assert.equal(sistema.ultimaReserva().precio, 13500);
  });
});

test('las reservas hechas en meses anteriores no cuentan para el mes actual', { todo: 'HALLAZGO C-4' }, async () => {
  // Falla si: el conteo del mes no distingue en qué mes se registró la reserva.
  await conSistema(async (sistema) => {
    for (const dia of ['01', '02', '03']) {
      sistema.sembrarConFechaDeRegistro({
        cancha: 1, fecha: `2026-09-${dia}`, hora: 10,
        cliente: 'Marco Jiménez', telefono: TELEFONO, precio: 15000, mesesAtras: 2,
      });
    }

    await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });

    // Es la primera reserva hecha este mes: no hay descuento.
    assert.equal(sistema.ultimaReserva().precio, 15000);
  });
});

test('cancelar una reserva no cambia el precio ya cobrado en otra', async () => {
  // Falla si: el precio de una reserva se recalcula después de registrarla.
  await conSistema(async (sistema) => {
    await registrarVarias(sistema, { cantidad: 3, desdeDia: 1 });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-04', hora: 10, cliente: 'Marco Jiménez', telefono: TELEFONO,
    });

    const conDescuento = sistema.ultimaReserva();
    assert.equal(conDescuento.precio, 13500);

    await sistema.cancelar(sistema.reservas()[0].id);

    const despues = sistema.reservas().find((fila) => fila.id === conDescuento.id);
    assert.equal(despues.precio, 13500);
  });
});
