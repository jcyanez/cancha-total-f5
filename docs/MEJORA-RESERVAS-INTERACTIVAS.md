# Mejora — Reservas interactivas desde la grilla

Este documento describe una **mejora de producto posterior a las entregas académicas**. No forma
parte del Caso Práctico 5 ni del 6, y **no es un Caso Práctico 7**: al momento de escribirlo no
existe ninguna consigna de Caso 7 en este repositorio, y nada de lo que sigue debe leerse como
evidencia de una.

La evidencia de los Casos 5 y 6 —[ESPECIFICACION.md](../ESPECIFICACION.md),
[HALLAZGOS.md](../HALLAZGOS.md), [STATUS.md](../STATUS.md),
[ENTREGA-CASO-6.md](ENTREGA-CASO-6.md), [CI-CD.md](CI-CD.md), los nueve archivos de pruebas
originales y `verificar.sh`— **no se tocó**. Se comprobó por hash, no por promesa.

---

## 1. Qué cambió

Antes, la grilla de disponibilidad decía **Libre** u **Ocupado** y ahí terminaba. Para reservar
había que bajar al formulario y volver a elegir a mano la cancha y la hora que uno acababa de
mirar; para llegar a una reserva existente había que pasar por la lista del día.

Ahora cada bloque ofrece la acción que le corresponde:

```
Bloque libre    →  /reservar?cancha=1&fecha=2026-09-10&hora=15
                   formulario con el bloque ya elegido y su tarifa

Bloque ocupado  →  /reserva/12
                   detalle de esa reserva y, si está en plazo,
                   /reserva/12/cancelar → confirmación → POST
```

### Rutas nuevas

| Ruta | Qué hace | Escribe en la base |
|---|---|---|
| `GET /reservar` | Formulario con cancha, fecha y hora precargadas | No |
| `GET /reserva/:id` | Detalle de la reserva que ocupa un bloque | No |
| `GET /reserva/:id/cancelar` | Confirmación antes de anular | No |

Las tres son de solo lectura. **El alta la sigue haciendo `POST /reservas` y la baja
`POST /reservas/:id/cancelar`, sin un solo cambio**: las reglas de negocio no se movieron de donde
estaban.

---

## 2. Lo que NO se hizo, y por qué

- **No se puede editar una reserva.** `FUERA-1` de la especificación lo declara fuera de alcance, y
  levantarlo exige registrar ahí una decisión explícita en contrario. Nadie la tomó, así que la
  capacidad no existe. Quien quiera cambiar de hora cancela y vuelve a reservar, que es el camino
  que el sistema ya soportaba.
- **El detalle no muestra el nombre ni el teléfono del cliente.** El sistema no tiene control de
  acceso (`FUERA-2`): cualquiera con la dirección entra. Mientras esos datos vivían en la lista del
  día, la exposición estaba acotada; ponerlos a dos clics de la portada pública la ampliaba sin que
  nadie lo hubiera pedido. Siguen donde estaban, en `/dia/:fecha`, tal como fija `PANT-12`.
  La decisión es la constante `DETALLE_MUESTRA_DATOS_DEL_CLIENTE` en `server.js`, en `false`.
- **El fondo no lleva foto.** La única disponible pesa 5 MB en vertical, en la máquina de trabajo no
  hay con qué optimizarla y agregar dependencias estaba fuera de alcance. Integrarla habría metido
  5 MB en el bundle de la función, en la descarga móvil y en el historial de git para siempre. El
  fondo es una cancha dibujada con degradados, y la foto queda **cableada**: si aparece
  `public/images/cancha-futbol-fondo.jpg`, el servidor la detecta al arrancar y el CSS la usa. Cero
  líneas de código.

---

## 3. La suite mandó sobre el diseño

Esto es lo más interesante de la mejora y conviene dejarlo escrito.

Las pruebas existentes eran **inmutables**, y tres de ellas leen el HTML con expresiones regulares
literales. No fueron un obstáculo a esquivar: **fijaron la forma del diseño**.

| Lo que exige la prueba | Lo que obligó a hacer |
|---|---|
| `<td>${hora}:00</td><td[^>]*>(Libre\|Ocupado)</td>` | La acción **no puede vivir dentro de la celda de Estado**. Va en una cuarta columna, al final de la fila. |
| `...<td>₡([\d.]+)</td>` | La celda de tarifa no admite atributos ni elementos anidados. Quedó igual. |
| `<option value="(\d+)">` — con el `>` pegado | **Prohibido `selected` en el formulario de la portada.** La precarga vive en `/reservar`, y el formulario compartido la emite solo cuando se le pide. |
| `doesNotMatch(/₡/)` en la pantalla por cancha | El enlace de esa pantalla no menciona precios. |

Ninguna prueba se modificó para acomodar el diseño. **El diseño se acomodó a las pruebas**, que es
lo que una red de seguridad tiene que provocar cuando funciona.

---

## 4. Verificación

Después de cada grupo de trabajo se corrió la puerta completa. Estado final:

```
--- Lint ---
--- Pruebas ---
# tests 129
# pass 129
# fail 0
# skipped 0
# todo 0
--- Artefacto (build) ---
Artefacto verificado: el sistema puede desplegarse.
--- Humo ---
11/11 comprobaciones pasaron.
Verificacion completa.        exit 0
```

De 87 a **129 pruebas**: 42 nuevas, en tres archivos nuevos.

| Archivo | Pruebas | Qué cubre |
|---|---|---|
| `pruebas/interaccion-disponibilidad.test.js` | 9 | La grilla accionable: los 14 bloques de cada cancha, a dónde lleva cada uno, el nombre accesible de cada acción |
| `pruebas/gestion-reserva-desde-bloque.test.js` | 20 | `/reservar` precargado y validado, el detalle, la privacidad, el plazo de 24 h y la confirmación de solo lectura |
| `pruebas/ux-disponibilidad.test.js` | 13 | Sugerencias, avisos flotantes, fila marcada y distintivos |

Los diez archivos originales de `pruebas/` se compararon **por hash** contra `main`: idénticos.

### La prueba que más importa

```js
await pedir(sistema, `/reserva/${reserva.id}/cancelar`);
await pedir(sistema, `/reserva/${reserva.id}/cancelar`);

assert.deepEqual(sistema.reservas(), antes);
```

Pedir la pantalla de confirmación no puede cambiar nada. Si cancelara por sí sola, bastaría con
pegar la dirección en un chat que previsualiza enlaces para anular una reserva que nadie decidió
anular.

---

## 5. Accesibilidad

- Área táctil de **44 px** reales en cada acción, en móvil y escritorio.
- Foco visible de 3 px con separación, en todos los controles nuevos. Nunca `outline: none`.
- **El color no es la única señal**: Reservar y Administrar se distinguen además por forma, icono y
  peso tipográfico.
- Las sugerencias viajan en `data-sugerencia` y aparecen en `:hover` **y en `:focus-visible`**. El
  `title` nativo se quitó porque no llega al teclado ni al táctil.
- El botón vedado usa `aria-disabled` y no `disabled`, para seguir siendo enfocable: con `disabled`,
  quien navega con teclado se queda sin la explicación de por qué no puede cancelar.
- Avisos flotantes con `role="status"` los informativos y `role="alert"` los errores. Se cierran sin
  JavaScript, con una casilla y una etiqueta. Los de error no caducan solos.
- Tema claro y oscuro con los mismos tokens; nada de color literal fuera de `:root`.
- Se corrigió un contraste real que ya estaba mal: la hora de los bloques con luz daba **3,36:1**,
  por debajo del mínimo de 4,5:1. Ahora usa un token propio y da **5,5:1**.
- Peor contraste medido en todos los caminos del fondo nuevo, incluido el peor píxel imaginable bajo
  una foto futura: **4,84:1**.

**Límite declarado.** El comportamiento responsive y los temas están razonados por construcción y
verificados sobre el HTML y el CSS servidos, pero **no medidos en un navegador real**: no hay
Playwright ni Puppeteer en el entorno y agregar dependencias estaba fuera de alcance. Queda como
comprobación pendiente, no como comprobación hecha.

---

## 6. Sobre los avisos flotantes

Se emiten tres y se descartaron cinco. El criterio fue que **un aviso solo existe si dice algo que
la página no está diciendo ya**; repetir en un globo el mismo texto que ya ocupa la pantalla no es
información, es la misma frase leída dos veces por un lector de pantalla.

Los tres que quedaron:

| Cuándo | Rol | Qué agrega |
|---|---|---|
| Se abre `/reservar` desde un bloque | `status` | Que la precarga fue efecto del clic, y no un valor por omisión |
| El bloque se ocupó entre la grilla y el clic | `alert` | De dónde salió el choque: la grilla decía Libre cuando se dibujó |
| Se pide cancelar fuera de plazo | `alert` | Que la reserva **sigue activa**, que es la pregunta de quien acaba de pedir la baja |

---

## 7. Cómo se trabajó

La mejora se coordinó con agentes especializados, cada uno con un alcance acotado y su verificación
propia. Como todo el servidor vive en un solo archivo, los que escriben sobre `server.js` corrieron
**en serie**; solo la auditoría de regresión y la de CI/CD corrieron en paralelo, porque no
comparten archivos.

| Agente | Tarea | Archivos |
|---|---|---|
| A — Auditor de arquitectura | Inventario de rutas, pruebas frágiles, riesgos y orden de trabajo. Sin permiso de escritura | ninguno |
| B — Navegación de bloques | Columna de acción y `bloquesOcupadosDelDia()` con id | `server.js` |
| C — Nueva reserva | `GET /reservar` y el formulario compartido | `server.js` |
| D — Administración | `GET /reserva/:id` y la confirmación | `server.js` |
| E — UX y accesibilidad | Estados, badges, foco, contraste, responsive | `server.js` |
| F — Sugerencias y avisos | Tooltips accesibles y avisos flotantes | `server.js` |
| G — Fondo visual | Cancha en CSS y el interruptor de la foto | `server.js`, `public/images/` |
| H — Pruebas nuevas | Las 42 pruebas, contra el contrato y no contra el código | 3 archivos nuevos |
| I — Regresión | Verificación independiente de que nada se debilitó | ninguno |
| J — CI/CD | Que la puerta siga cubriendo todo | `.github/` |

Después de cada grupo se corrió `./verificar.sh` y se revisó el diff antes de commitear. Ningún
informe de agente se dio por bueno sin comprobarlo.
