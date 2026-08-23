# Lo que queda pendiente

Checklist vivo del Caso Práctico 5. **Solo contiene trabajo sin hacer**: cuando un paso se cierra,
se borra de acá y su evidencia queda en el documento que le corresponde.

**Documentos:** [ESPECIFICACION.md](ESPECIFICACION.md) · [HALLAZGOS.md](HALLAZGOS.md) · [README.md](README.md)

**Entrega:** martes 25 de agosto de 2026, al inicio de la Sesión 6.

---

## Dónde estamos parados

| | |
|---|---|
| **Pruebas** | 71 — **63 pasan**, 8 marcadas como fallo esperado |
| **Puerta** | `./verificar.sh` sale en **0** |
| **Hook `Stop`** | instalado — en verde deja cerrar el turno, en rojo devuelve 2 y lo bloquea |
| **Hallazgos de comportamiento** | 5 · **1 cerrado (C-1)** · 4 abiertos |
| **Hallazgos de estructura** | 10 · **1 pagado (E-5)** · 9 abiertos |
| **Código del proveedor** | `server.js` modificado a propósito por la Tanda 1; los otros 5 archivos, intactos |
| **Commits propios** | 3 encima de `65ce4b4`: la red, la estructura, el comportamiento |

Con la Tanda 1 cerrada, **el mínimo que exige la consigna ya está cumplido**: un hallazgo de
comportamiento cerrado haciendo pasar su prueba sin tocarla, y una deuda de estructura pagada que
estaba en su camino, en commits separados.

---

## Reglas de juego

Valen para todos los pasos de abajo. Romper una invalida el trabajo aunque el resultado funcione.

- **Ningún commit mezcla estructura con comportamiento.** Son dos oficios distintos.
- **En un commit de estructura la suite da exactamente lo mismo antes y después.**
- **Un hallazgo se cierra haciendo pasar su prueba sin tocarla.** Si hay que modificar la prueba para que pase, el hallazgo no está cerrado.
- **No se agregan funciones nuevas** ni se cambia el stack. SQLite se queda.
- **`verificar.sh` sale en 0 al entregar**, con los hallazgos abiertos marcados y su número.

---

## Pendiente 1 · Cierre de la entrega

- [ ] `README.md` actualizado: hoy es el del proveedor y **no menciona la verificación** — falta cómo correr `./verificar.sh` y qué significan sus códigos de salida
- [ ] Este `STATUS.md` con el marcador final
- [ ] `./verificar.sh` sale en 0
- [ ] La aplicación sigue arrancando según el `README.md`
- [ ] Revisado que ningún commit mezcla estructura con comportamiento
- [ ] Revisado que ninguna prueba fue modificada para hacer pasar un hallazgo
- [ ] **Decidir cómo se publica** (repo aparte en GitHub o submódulo del repositorio raíz) — es decisión del usuario, y va antes de cualquier `push`
- [ ] Repositorio publicado con el commit del proveedor y todos los propios encima

Detalle menor, opcional: el comentario de cabecera de `pruebas/tarifas.test.js` todavía describe la
tarifa como repartida en tres manejadores. Era cierto cuando se escribió; `E-5` lo dejó viejo. No
afecta a ninguna aserción.

---

## Opcional · Tandas siguientes

Ninguna hace falta para cumplir la consigna. Cada una es **independiente de las demás**: se puede
tomar cualquiera, en cualquier orden, o ninguna. Lo que no es independiente es el par
estructura → comportamiento dentro de cada tanda.

| Tanda | Hallazgo | Deuda en su camino | Pruebas que se destraban |
|---|---|---|---|
| 2 | **C-2** teléfono sin validar | — (la validación ya vive en un solo lugar) | 4 |
| 3 | **C-5** plazo de cancelación | **E-6** el reloj se lee desde adentro de la regla | 1 |
| 4 | **C-3** las canceladas cuentan para frecuente | — | 1 |
| 5 | **C-4** mes del partido en vez de mes de registro | — | 2 |

Si se toma alguna, el camino es el mismo que el de la Tanda 1: primero la deuda de estructura que
está en el camino, con la suite dando exactamente lo mismo antes y después; después el
comportamiento, quitando la marca `{ todo: 'HALLAZGO C-x' }` de sus pruebas sin tocarles nada más;
y la evidencia de cierre en `HALLAZGOS.md`.

Deuda de estructura que **no** está en el camino de ninguno de esos hallazgos, y por lo tanto queda
anotada y sin pagar: `E-1`, `E-2`, `E-3`, `E-4`, `E-7`, `E-8`, `E-9`, `E-10`.
