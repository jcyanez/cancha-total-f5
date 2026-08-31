// ===========================================================================
// ARCHIVO TEMPORAL — SE BORRA EN EL SIGUIENTE COMMIT DE ESTE MISMO PULL REQUEST
// ===========================================================================
//
// Esto no es una prueba del sistema. No comprueba ninguna regla de negocio, no
// aparece en ESPECIFICACION.md y no cuenta entre las 87 pruebas de la suite.
//
// Existe para demostrar una sola cosa, y para demostrarla donde importa —
// dentro de un pull request, no en un push suelto a una rama de demostración:
//
//     con `main` protegida y el check `Lint · Pruebas · Build · Humo`
//     declarado obligatorio, un pull request cuyo CI está en rojo NO se
//     puede fusionar. La puerta no es un adorno del README: es la
//     configuración de la rama, y bloquea al administrador igual que a
//     cualquier otro (enforce_admins = true).
//
// La prueba falla a propósito y de la forma más aburrida posible: una igualdad
// aritmética falsa. Así la corrida roja no deja ninguna duda sobre su causa —
// no hay red, ni reloj, ni base de datos, ni orden de pruebas de por medio. Lo
// único que puede hacerla fallar es que esté escrita para fallar.
//
// El commit siguiente borra este archivo por completo. No se ablanda la
// aserción, no se convierte en una prueba trivial que quede para siempre, no
// se marca como `skip`: desaparece, y la misma corrida vuelve a verde con las
// 87 pruebas originales intactas.
//
// Evidencia de la transición roja -> verde: ver docs/CI-CD.md.

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('DEMOSTRACIÓN TEMPORAL: falla a propósito para cerrar la puerta del CI', () => {
  // Falla si: nunca deja de fallar. Ese es el punto — mientras este archivo
  // exista, el CI está rojo y el pull request está bloqueado.
  assert.equal(
    2 + 2,
    5,
    'Fallo deliberado: demuestra que un PR en rojo no se puede fusionar. ' +
      'Este archivo se borra en el commit siguiente del mismo pull request.',
  );
});
