# Lo que queda pendiente

Checklist vivo del Caso Práctico 5. **Solo contiene trabajo sin hacer**: cuando un paso se cierra,
se borra de acá y su evidencia queda en el documento que le corresponde.

**Documentos:** [ESPECIFICACION.md](ESPECIFICACION.md) · [HALLAZGOS.md](HALLAZGOS.md) · [README.md](README.md)

**Entrega:** martes 25 de agosto de 2026, al inicio de la Sesión 6.

---

## Dónde estamos parados

| | |
|---|---|
| **Pruebas** | 71 — 60 pasan, **11 marcadas como fallo esperado** |
| **Puerta** | `./verificar.sh` sale en **0** |
| **Hook `Stop`** | instalado — comprobado que en verde deja cerrar y en rojo devuelve 2 y bloquea |
| **Hallazgos de comportamiento** | 5 · 0 cerrados · **5 abiertos** |
| **Hallazgos de estructura** | 10 · 0 pagados · **10 abiertos** |
| **Código del proveedor** | intacto — `git diff 65ce4b4` vacío sobre los 6 archivos originales |
| **Commits propios** | 1 — la red y la puerta, encima de `65ce4b4` |

Ya cerrado y fuera de esta lista: la auditoría del sistema recibido, la especificación reconstruida
punto por punto con el cliente (61 condiciones), la suite completa con su señal comprobada,
`HALLAZGOS.md`, `verificar.sh`, el hook `Stop` y el commit de la red.

---

## Reglas de juego

Valen para todos los pasos de abajo. Romper una invalida el trabajo aunque el resultado funcione.

- **Ningún commit mezcla estructura con comportamiento.** Son dos oficios distintos.
- **En un commit de estructura la suite da exactamente lo mismo antes y después**: mismos 60 en verde, mismas 11 marcadas.
- **Un hallazgo se cierra haciendo pasar su prueba sin tocarla.** Si hay que modificar la prueba para que pase, el hallazgo no está cerrado.
- **El commit de la red precede a todos los de refactorización.**
- **No se agregan funciones nuevas** ni se cambia el stack. SQLite se queda.
- **`verificar.sh` sale en 0 al entregar**, con los hallazgos abiertos marcados y su número.

---

## Pendiente 1 · Cerrar hallazgos con la red puesta

El orden **no es libre**: primero se paga la deuda de estructura que está en el camino, con la
suite dando lo mismo; después se cambia el comportamiento, que queda en una sola línea.

La consigna pide **al menos un hallazgo de comportamiento cerrado y al menos una deuda de
estructura pagada** que esté en su camino. La Tanda 1 cumple las dos cosas.

### Tanda 1 — C-1 (tarifa de las 17:00) + E-5 (tarifa triplicada)

C-1 es el error que le cuesta plata al negocio todos los días, y E-5 es exactamente la deuda que
está en su camino: la tarifa está calculada en **tres lugares**, así que sin pagarla habría que
acertar el arreglo tres veces.

**Paso 1 · Estructura (E-5)** — un solo commit, sin cambiar comportamiento

- [ ] Escribir una única función de tarifa que reciba la hora y devuelva el precio
- [ ] Reemplazar por ella el cálculo de la grilla de disponibilidad
- [ ] Reemplazar por ella el cálculo del registro de la reserva
- [ ] Reemplazar por ella el cálculo de la cotización previa
- [ ] Correr la suite: **debe dar exactamente 60 en verde y 11 marcadas**, ni una más ni una menos
- [ ] Commit de estructura, sin mezclar nada más

**Paso 2 · Comportamiento (C-1)** — depende del paso 1

- [ ] Mover el borde de la tarifa con luz de las 18:00 a las 17:00, **en la única función que ahora existe**
- [ ] Quitar la marca `{ todo: 'HALLAZGO C-1' }` de sus **3** pruebas, sin tocar nada más de ellas
- [ ] Correr la suite: **63 en verde, 8 marcadas**
- [ ] Anotar en `HALLAZGOS.md` la evidencia de cierre de C-1
- [ ] Commit de comportamiento, separado del anterior

**Paso 3 · Comprobación visual**

- [ ] Tomar las capturas «después»
- [ ] Comparar el bloque de las 17:00: antes ₡15.000, después ₡20.000
- [ ] Verificar que los bloques de las 16:00 y 18:00 **no** cambiaron

### Tandas siguientes — opcionales, sin decidir

Cada una es **independiente de las demás**: se puede tomar cualquiera, en cualquier orden, o
ninguna. Lo que no es independiente es el par estructura → comportamiento dentro de cada tanda.

| Tanda | Hallazgo | Deuda en su camino | Pruebas que se destraban |
|---|---|---|---|
| 2 | **C-2** teléfono sin validar | — (la validación ya vive en un solo lugar) | 4 |
| 3 | **C-5** plazo de cancelación | **E-6** el reloj se lee desde adentro de la regla | 1 |
| 4 | **C-3** las canceladas cuentan para frecuente | — | 1 |
| 5 | **C-4** mes del partido en vez de mes de registro | — | 2 |

Deuda de estructura que **no** está en el camino de ningún hallazgo elegido, y por lo tanto **se
anota y no se paga ahora**: `E-1`, `E-2`, `E-3`, `E-4`, `E-7`, `E-8`, `E-9`, `E-10`.

---

## Pendiente 2 · Cierre de la entrega

- [ ] `README.md` actualizado: hoy es el del proveedor y **no menciona la verificación** — falta cómo correr `./verificar.sh` y qué significan sus códigos de salida
- [ ] `HALLAZGOS.md` con la evidencia de cierre de cada hallazgo cerrado
- [ ] Este `STATUS.md` con el marcador final
- [ ] `./verificar.sh` sale en 0
- [ ] La aplicación sigue arrancando según el `README.md`
- [ ] Revisado que ningún commit mezcla estructura con comportamiento
- [ ] Revisado que ninguna prueba fue modificada para hacer pasar un hallazgo
- [ ] **Decidir cómo se publica** (repo aparte en GitHub o submódulo del repositorio raíz) — es decisión del usuario, y va antes de cualquier `push`
- [ ] Repositorio publicado con el commit del proveedor y todos los propios encima
