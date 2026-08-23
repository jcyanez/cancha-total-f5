// Datos de una reserva — RN-11 a RN-17 de ESPECIFICACION.md
//
// NIVEL: integración. Razón: las validaciones están escritas dentro del
// manejador que registra la reserva, entremezcladas con el resto del trámite
// (hallazgo E-1). Se comprueban por su efecto observable: la reserva quedó
// guardada o no quedó guardada. Esa afirmación sobrevive a que las
// validaciones se muden a una función propia.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema, problemasInformados } = require('./soporte/servidor.js');

const RESERVA_VALIDA = {
  cancha: 1, fecha: '2026-09-10', hora: 10, cliente: 'Ana Vargas', telefono: '88112233',
};

test('una reserva con todos sus datos queda registrada', async () => {
  // Falla si: se rechaza una reserva que cumple todas las reglas.
  await conSistema(async (sistema) => {
    await sistema.reservar(RESERVA_VALIDA);
    assert.equal(sistema.cuantasReservas(), 1);
  });
});

test('sin teléfono no se registra la reserva', async () => {
  // Falla si: el teléfono deja de ser obligatorio.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, telefono: '' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un teléfono de siete dígitos no se registra', async () => {
  // Falla si: se acepta un teléfono más corto que ocho dígitos.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, telefono: '8811223' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un teléfono de nueve dígitos no se registra', async () => {
  // Falla si: se acepta un teléfono más largo que ocho dígitos.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, telefono: '881122334' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un teléfono con letras no se registra', async () => {
  // Falla si: se acepta como teléfono algo que no son ocho dígitos.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, telefono: '8811-2233' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un teléfono de ocho dígitos se registra', async () => {
  // Falla si: se rechaza un teléfono que cumple la regla.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, telefono: '60112233' });
    assert.equal(sistema.cuantasReservas(), 1);
  });
});

test('sin nombre del cliente no se registra la reserva', async () => {
  // Falla si: el nombre del cliente deja de ser obligatorio.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, cliente: '' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('un nombre de solo espacios no se registra', async () => {
  // Falla si: un nombre en blanco pasa como nombre válido.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, cliente: '    ' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('una cancha distinta de 1 y 2 no se registra', async () => {
  // Falla si: se acepta una cancha que no existe.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, cancha: 3 });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('la hora de las 7:00 no se registra, está antes del primer bloque', async () => {
  // Falla si: el primer bloque del día deja de ser el de las 8:00.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, hora: 7 });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('la hora de las 22:00 no se registra, está después del último bloque', async () => {
  // Falla si: el último bloque del día deja de ser el de las 21:00.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, hora: 22 });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('los bloques de las 8:00 y las 21:00 sí se registran', async () => {
  // Falla si: se rechaza alguno de los dos bloques extremos del día.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, hora: 8 });
    await sistema.reservar({ ...RESERVA_VALIDA, hora: 21 });
    assert.equal(sistema.cuantasReservas(), 2);
  });
});

test('una fecha en otro formato no se registra', async () => {
  // Falla si: se acepta una fecha que no viene como AAAA-MM-DD.
  await conSistema(async (sistema) => {
    await sistema.reservar({ ...RESERVA_VALIDA, fecha: '10-09-2026' });
    assert.equal(sistema.cuantasReservas(), 0);
  });
});

test('se informan todos los problemas juntos, no solo el primero', async () => {
  // Falla si: la validación se corta en el primer dato incorrecto.
  await conSistema(async (sistema) => {
    const respuesta = await sistema.reservar({
      cancha: 7, fecha: '', hora: 30, cliente: '', telefono: '88112233',
    });
    assert.equal(sistema.cuantasReservas(), 0);
    assert.ok(
      problemasInformados(respuesta.html) >= 4,
      `se esperaban al menos 4 problemas informados, se informaron ${problemasInformados(respuesta.html)}`
    );
  });
});
