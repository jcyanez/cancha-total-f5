// Qué queda registrado — REG-1 a REG-5 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: la condición describe qué guarda el sistema
// cuando entra una reserva por el camino del negocio. El efecto observable es
// la fila guardada, y eso es exactamente lo que se comprueba.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema } = require('./soporte/servidor.js');

test('cada reserva recibe su propio número', async () => {
  // Falla si: dos reservas comparten número o el número deja de avanzar.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
    });
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 11, cliente: 'Kevin Mora', telefono: '84223344',
    });

    const [primera, segunda] = sistema.reservas();
    assert.notEqual(primera.id, segunda.id);
    assert.ok(segunda.id > primera.id, 'el número de reserva debe avanzar');
  });
});

test('se guarda exactamente lo que se pidió', async () => {
  // Falla si: alguno de los datos de la reserva se pierde o se altera al guardarlo.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 2, fecha: '2026-09-10', hora: 19, cliente: 'Sofía Araya', telefono: '87654321',
    });

    const guardada = sistema.ultimaReserva();
    assert.equal(guardada.cancha, 2);
    assert.equal(guardada.fecha, '2026-09-10');
    assert.equal(guardada.hora, 19);
    assert.equal(guardada.cliente, 'Sofía Araya');
    assert.equal(guardada.telefono, '87654321');
  });
});

test('una reserva nace activa', async () => {
  // Falla si: una reserva recién registrada no queda en pie.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
    });
    assert.equal(sistema.ultimaReserva().estado, 'activa');
  });
});

test('queda registrado el momento en que se hizo la reserva', async () => {
  // Falla si: se deja de guardar la fecha de registro. Es el dato del que
  // depende el mes del cliente frecuente (RN-23).
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
    });

    const guardada = sistema.ultimaReserva();
    assert.ok(guardada.creada_en, 'la reserva debe guardar cuándo se registró');
    assert.match(guardada.creada_en, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});

test('el nombre del cliente se guarda sin espacios sobrantes', async () => {
  // Falla si: los espacios de los extremos dejan de recortarse y el mismo
  // cliente aparece escrito de dos maneras.
  await conSistema(async (sistema) => {
    await sistema.reservar({
      cancha: 1, fecha: '2026-09-10', hora: 10, cliente: '  Ana Vargas  ', telefono: '88112233',
    });
    assert.equal(sistema.ultimaReserva().cliente, 'Ana Vargas');
  });
});
