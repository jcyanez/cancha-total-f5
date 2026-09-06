// Presentación de la disponibilidad — las sugerencias de cada acción, los
// avisos flotantes, la fila que quedó señalada y el distintivo del detalle.
//
// NIVEL: integración. Razón: lo que se afirma es lo que llega al navegador de
// quien usa el sistema —en qué atributo viaja la sugerencia, qué rol tiene el
// aviso, qué fila queda marcada—, y eso solo se puede leer sobre la página ya
// armada. No hay una capa de vista separada a la que preguntarle (hallazgo
// E-1).
//
// Estas pruebas afirman decisiones de accesibilidad, no maqueta: son las que
// impiden que la ayuda vuelva a viajar en un `title` que el teclado y el táctil
// nunca ven, que un aviso pierda su rol, o que un distintivo diga lo contrario
// de lo que muestra el botón que tiene al lado.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { conSistema } = require('./soporte/servidor.js');

const CLIENTE = { cliente: 'Ana Vargas', telefono: '88112233' };
const FECHA = '2026-09-10';
const BLOQUES = Array.from({ length: 14 }, (_, i) => 8 + i);

async function pedir(sistema, ruta) {
  const respuesta = await fetch(sistema.direccion + ruta);
  return { estado: respuesta.status, html: await respuesta.text() };
}

// La tabla de disponibilidad de una cancha: en la portada hay dos, debajo de
// su subtítulo; en la pantalla de una sola cancha hay una sola.
function grillaDeCancha(html, cancha) {
  const desdeElSubtitulo = html.indexOf(`<h3>Cancha ${cancha}</h3>`);
  const trozo = desdeElSubtitulo === -1 ? html : html.slice(desdeElSubtitulo);
  const inicio = trozo.indexOf('<table');
  const fin = trozo.indexOf('</table>');
  return inicio === -1 || fin === -1 ? '' : trozo.slice(inicio, fin);
}

// La acción de un bloque, con los atributos que hacen a su presentación.
function accionDelBloque(grilla, hora) {
  const fila = grilla.match(new RegExp(`<tr[^>]*><td>${hora}:00</td>([\\s\\S]*?)</tr>`));
  if (!fila) return null;
  const enlace = fila[1].match(/<a\b([^>]*)>([\s\S]*?)<\/a>/);
  if (!enlace) return null;
  const atributo = (nombre) => {
    const encontrado = enlace[1].match(new RegExp(`${nombre}="([^"]*)"`));
    return encontrado ? encontrado[1] : null;
  };
  return {
    destino: atributo('href'),
    sugerencia: atributo('data-sugerencia'),
    titulo: atributo('title'),
  };
}

// Las horas de los bloques cuya fila quedó señalada como la elegida.
function bloquesMarcados(grilla) {
  const filas = grilla.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  return filas
    .filter((fila) => /^<tr[^>]*class="[^"]*\bseleccionada\b/.test(fila))
    .map((fila) => Number((fila.match(/<td>(\d{1,2}):00<\/td>/) || [])[1]));
}

// Lo que la página muestra, sin la cabecera del documento. La hoja de estilo
// viaja dentro de <style> y sus comentarios nombran los distintivos para
// explicar de qué hablan: buscar un rótulo en el documento entero encontraría
// esa mención y no la que se ve en pantalla.
function contenidoDeLaPagina(html) {
  const inicio = html.indexOf('<main');
  const fin = html.indexOf('</main>');
  return inicio === -1 || fin === -1 ? html : html.slice(inicio, fin);
}

// Los avisos flotantes de una pantalla, con el rol con que se anuncian y lo
// que dicen.
function avisosFlotantes(html) {
  const encontrados = html.match(/<div class="flotante[^"]*"[^>]*>[\s\S]*?<\/div>/g) || [];
  return encontrados.map((aviso) => ({
    rol: (aviso.match(/role="([^"]*)"/) || [])[1] ?? null,
    texto: (aviso.match(/<p>([\s\S]*?)<\/p>/) || [])[1] ?? '',
  }));
}

// --- La sugerencia de cada acción -------------------------------------------

test('cada acción de la grilla lleva su sugerencia en data-sugerencia', async () => {
  // Falla si: algún control de la grilla se queda sin la ayuda que explica a
  // dónde lleva.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 13, ...CLIENTE });
    const portada = await sistema.inicio(FECHA);
    const porCancha = await sistema.disponibilidad(1, FECHA);

    for (const grilla of [grillaDeCancha(portada, 1), grillaDeCancha(portada, 2), grillaDeCancha(porCancha, 1)]) {
      for (const hora of BLOQUES) {
        assert.ok(accionDelBloque(grilla, hora).sugerencia, `falta la sugerencia de las ${hora}:00`);
      }
    }
  });
});

test('las acciones de la grilla no usan el title nativo', async () => {
  // Falla si: la ayuda vuelve a viajar en `title`, que no aparece con el
  // teclado ni en una pantalla táctil, y que además duplicaría el globo.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 2, fecha: FECHA, hora: 13, ...CLIENTE });
    const portada = await sistema.inicio(FECHA);

    for (const cancha of [1, 2]) {
      const grilla = grillaDeCancha(portada, cancha);
      assert.doesNotMatch(grilla, /\stitle="/, `la grilla de la cancha ${cancha} usa title`);
      for (const hora of BLOQUES) {
        assert.equal(accionDelBloque(grilla, hora).titulo, null);
      }
    }
  });
});

test('la sugerencia de un bloque libre invita a reservar esa cancha a esa hora', async () => {
  // Falla si: la sugerencia deja de nombrar la cancha y la hora del bloque.
  await conSistema(async (sistema) => {
    const grilla = grillaDeCancha(await sistema.inicio(FECHA), 1);

    assert.equal(accionDelBloque(grilla, 15).sugerencia, 'Reservar Cancha 1 a las 15:00');
  });
});

test('la sugerencia de un bloque ocupado ofrece verlo o administrarlo', async () => {
  // Falla si: la sugerencia de una ocupación deja de decir qué se puede hacer
  // con ella, o de nombrar el bloque del que habla.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 15, ...CLIENTE });
    const grilla = grillaDeCancha(await sistema.inicio(FECHA), 1);

    assert.equal(
      accionDelBloque(grilla, 15).sugerencia,
      'Ver o administrar reserva de Cancha 1 a las 15:00',
    );
  });
});

// --- La fila señalada --------------------------------------------------------

test('la fila del bloque que nombra la dirección queda marcada', async () => {
  // Falla si: se pierde la única memoria de «en este bloque estaba» que tiene
  // un sistema sin estado en el navegador.
  await conSistema(async (sistema) => {
    const { html } = await pedir(sistema, `/?fecha=${FECHA}&cancha=1&hora=9`);

    assert.deepEqual(bloquesMarcados(grillaDeCancha(html, 1)), [9]);
    assert.deepEqual(bloquesMarcados(grillaDeCancha(html, 2)), [],
      'la marca se contagió a la otra cancha');
  });
});

test('en la pantalla de una cancha alcanza con la hora para marcar la fila', async () => {
  // Falla si: la pantalla que ya sabe de qué cancha habla exige igual el
  // parámetro de cancha para señalar el bloque.
  await conSistema(async (sistema) => {
    const { html } = await pedir(sistema, `/disponibilidad/cancha2?fecha=${FECHA}&hora=20`);

    assert.deepEqual(bloquesMarcados(grillaDeCancha(html, 2)), [20]);
  });
});

test('sin bloque en la dirección no queda ninguna fila marcada', async () => {
  // Falla si: la grilla señala un bloque que nadie eligió.
  await conSistema(async (sistema) => {
    const portada = await sistema.inicio(FECHA);

    assert.deepEqual(bloquesMarcados(grillaDeCancha(portada, 1)), []);
    assert.deepEqual(bloquesMarcados(grillaDeCancha(portada, 2)), []);
    assert.deepEqual(bloquesMarcados(grillaDeCancha(await sistema.disponibilidad(1, FECHA), 1)), []);
  });
});

// --- Los avisos flotantes -----------------------------------------------------

test('la pantalla de nueva reserva confirma qué quedó precargado', async () => {
  // Falla si: se pierde el aviso que distingue «el formulario ya sabe a qué
  // bloque voy» de «el formulario arrancó en la primera opción de la lista»,
  // que en pantalla se ven igual.
  await conSistema(async (sistema) => {
    const { html } = await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=15`);

    const avisos = avisosFlotantes(html);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].rol, 'status');
    assert.ok(avisos[0].texto.includes('Cancha 1'), 'el aviso no dice qué cancha quedó puesta');
    assert.ok(avisos[0].texto.includes(FECHA), 'el aviso no dice qué fecha quedó puesta');
    assert.ok(avisos[0].texto.includes('15:00'), 'el aviso no dice qué hora quedó puesta');
  });
});

test('un bloque que se ocupó entre la grilla y el clic se avisa como alerta', async () => {
  // Falla si: el choque con una reserva hecha en el medio se cuenta como una
  // confirmación tranquila y no como un problema que hay que resolver.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 15, ...CLIENTE });

    const { html } = await pedir(sistema, `/reservar?cancha=1&fecha=${FECHA}&hora=15`);

    const avisos = avisosFlotantes(html);
    assert.equal(avisos.length, 1);
    assert.equal(avisos[0].rol, 'alert');
  });
});

test('la portada sin parámetros no emite ningún aviso flotante', async () => {
  // Falla si: una pantalla que no tiene nada que decir interrumpe igual a quien
  // la abre.
  await conSistema(async (sistema) => {
    assert.deepEqual(avisosFlotantes(await sistema.inicio(FECHA)), []);
    assert.deepEqual(avisosFlotantes(await sistema.inicio()), []);
    assert.deepEqual(avisosFlotantes(await sistema.disponibilidad(1, FECHA)), []);
  });
});

// --- El distintivo del detalle -------------------------------------------------

test('el detalle de una reserva en plazo la distingue como cancelable', async () => {
  // Falla si: el distintivo desaparece o dice lo contrario de lo que ofrece el
  // botón que tiene al lado.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);

    assert.match(contenidoDeLaPagina(html), /PUEDE CANCELARSE/);
    assert.doesNotMatch(contenidoDeLaPagina(html), /NO CANCELABLE/);
    assert.ok(html.includes(`href="/reserva/${reserva.id}/cancelar"`), 'no ofrece cancelar');
  });
});

test('el detalle de una reserva fuera de plazo la distingue como no cancelable', async () => {
  // Falla si: el distintivo dice que se puede cancelar algo que ya no se puede.
  await conSistema(async (sistema) => {
    // Ahora: 18/08 10:00. Bloque: 19/08 08:00 — faltan 22 horas.
    await sistema.reservar({ cancha: 1, fecha: '2026-08-19', hora: 8, ...CLIENTE });
    const reserva = sistema.ultimaReserva();

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);

    assert.match(contenidoDeLaPagina(html), /NO CANCELABLE/);
    assert.doesNotMatch(contenidoDeLaPagina(html), /PUEDE CANCELARSE/);
    assert.ok(!html.includes(`href="/reserva/${reserva.id}/cancelar"`), 'ofrece cancelar igual');
  });
});

test('el detalle de una reserva ya cancelada la distingue como no cancelable', async () => {
  // Falla si: una reserva anulada se muestra como si todavía hubiera algo que
  // cancelar.
  await conSistema(async (sistema) => {
    await sistema.reservar({ cancha: 1, fecha: FECHA, hora: 19, ...CLIENTE });
    const reserva = sistema.ultimaReserva();
    await sistema.cancelar(reserva.id);

    const { html } = await pedir(sistema, `/reserva/${reserva.id}`);

    assert.match(contenidoDeLaPagina(html), /NO CANCELABLE/);
    assert.doesNotMatch(contenidoDeLaPagina(html), /PUEDE CANCELARSE/);
    assert.ok(!html.includes(`href="/reserva/${reserva.id}/cancelar"`), 'ofrece cancelar igual');
  });
});
