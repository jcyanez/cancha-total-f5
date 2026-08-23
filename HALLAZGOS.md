# Hallazgos

Lo que la suite descubrió al contrastar el sistema entregado contra
[`ESPECIFICACION.md`](ESPECIFICACION.md). **Nada de esto se corrigió al escribir las pruebas**:
cada hallazgo tiene su prueba escrita y marcada como fallo esperado, para que la puerta de
calidad sirva desde el primer día sin ocultar lo que falta.

Se cierran en los turnos de refactorización, **quitando la marca** de la prueba y sin tocar la
prueba misma. El avance se mide contando marcas quitadas.

**Estado:** 71 pruebas — 68 pasan, 3 marcadas como fallo esperado, `verificar.sh` sale en 0.
Cerrados: `C-1`, `C-2`, `C-3`. Pagados: `E-1`, `E-2`, `E-3`, `E-5`, `E-6`. El avance de cierre se lleva en [`STATUS.md`](STATUS.md).

---

## Cómo está marcado un fallo esperado

La prueba queda escrita tal cual, con la opción `todo` del corredor de pruebas y el número del
hallazgo:

```js
test('la hora de las 17:00 cuesta 20.000 porque la luz ya está encendida', { todo: 'HALLAZGO C-1' }, ...)
```

La prueba **se ejecuta y su fallo se reporta**, pero no derriba la puerta. Al cerrar el hallazgo
se quita `{ todo: ... }` y la prueba pasa a ser exigible.

---

## Hallazgos de comportamiento

El código hace algo que contradice la especificación.

| # | Condición (de la especificación) | Qué hace hoy | Pruebas | Estado |
|---|---|---|---|---|
| **C-1** | `RN-19` — La hora con luz cuesta ₡20.000 **desde las 17:00**: la luz se enciende a las 5 de la tarde y el partido de las 5 ya va con luz | Cobra ₡20.000 **desde las 18:00**. El bloque de las 17:00 lo cobra, lo cotiza y lo muestra a ₡15.000 | `pruebas/tarifas.test.js` → *la hora de las 17:00 cuesta 20.000…*, *una reserva de las 17:00 queda cobrada a 20.000*, *la pantalla de disponibilidad muestra 20.000…* | **Cerrado** |
| **C-2** | `RN-13` — El teléfono es **obligatorio** y tiene **exactamente 8 dígitos** | No se verifica nada: se acepta vacío, más corto, más largo y con caracteres que no son dígitos | `pruebas/validaciones.test.js` → *sin teléfono…*, *un teléfono de siete dígitos…*, *un teléfono de nueve dígitos…*, *un teléfono con letras…* | **Cerrado** |
| **C-3** | `RN-24` — Las reservas **canceladas no cuentan** para volverse cliente frecuente | El conteo del mes incluye las canceladas, así que un cliente que apartó y canceló llega al descuento sin haber jugado | `pruebas/cliente-frecuente.test.js` → *una reserva cancelada no cuenta para volverse cliente frecuente* | **Cerrado** |
| **C-4** | `RN-23` — «El mismo mes» es el mes en que **se registra** la reserva | El conteo se hace sobre el mes de la **fecha del partido**, e ignora la fecha de registro que la propia base ya guarda | `pruebas/cliente-frecuente.test.js` → *el mes que cuenta es aquel en que se hizo la reserva…*, *las reservas hechas en meses anteriores no cuentan…* | Abierto |
| **C-5** | `RN-27`, `RN-28` — Se cancela hasta **24 horas antes de la hora de inicio**; con menos, no hay cancelación | Compara solo **fechas de calendario**: cancela cualquier reserva de un día posterior a hoy, sin mirar la hora. El caso que describió la administradora —partido mañana a las 8:00, faltando 22 horas— se cancela | `pruebas/cancelacion.test.js` → *una reserva a menos de 24 horas no se cancela* | Abierto |

**Un mismo hallazgo, varias pruebas.** C-1 tiene tres porque la tarifa está calculada en tres
lugares distintos (ver `E-5`): arreglarla en uno solo deja los otros dos en rojo. C-2 tiene cuatro
porque son cuatro bordes distintos de la misma regla.

---

## Hallazgos de estructura

La condición no se puede probar sin cambiar el código, o la forma del código está en el camino de
un arreglo de comportamiento. **Ninguno se corrigió**: se anotan para decidir cuál se paga.

| # | Qué pasa | Cómo se manifiesta | Estado |
|---|---|---|---|
| **E-1** | `server.js` no exporta nada y llama a `app.listen()` al cargarse | **Ninguna regla se puede probar en unidad.** Toda la suite tuvo que hacerse de integración, lanzando el proceso real. Las reglas con lógica propia —tarifa, descuento, plazo— merecerían pruebas unitarias con casos borde y hoy no las pueden tener | **Pagado** |
| **E-2** | El puerto está fijo en el código (`const PUERTO = 3000`), sin variable de entorno | Las pruebas no pueden levantar el sistema en un puerto libre: hay que redirigir `listen()` desde afuera (`pruebas/soporte/arranque.js`) | **Pagado** |
| **E-3** | La ruta de la base de datos está fija (`path.join(__dirname, 'reservas.db')`) | Las pruebas no pueden apuntar a una base propia: hay que interceptar la carga de `better-sqlite3` desde afuera. Sin eso, correr las pruebas destruiría los datos reales | **Pagado** |
| **E-4** | No hay forma de registrar una reserva con una fecha de registro distinta de «ahora» | La prueba de `RN-23` que mira meses anteriores tiene que escribir directamente en la base, saltándose el camino del negocio y acoplándose al esquema | Abierto |
| **E-5** | **La tarifa se calcula en tres lugares**, con los mismos números repetidos: la grilla de disponibilidad, el registro de la reserva y la cotización previa. No hay una función de tarifa | Está **en el camino directo de C-1**: corregir la hora de la luz obliga a tocar los tres sitios y a acertar en los tres | **Pagado** |
| **E-6** | La regla de las 24 horas lee el reloj del sistema desde adentro de la regla | Sin poder inyectar el instante, la prueba de `RN-27` dependería del día en que se corra. Hubo que congelar el reloj desde afuera. Está **en el camino de C-5** | **Pagado** |
| **E-7** | Los dos manejadores de disponibilidad por cancha son **copia literal** uno del otro, con el número de cancha cambiado | Cualquier arreglo en la disponibilidad hay que hacerlo dos veces | Abierto |
| **E-8** | Código presente pero inactivo: la función de feriados que nadie llama, y las tarifas de temporada alta comentadas | La especificación declara que **no existen** (`FUERA-8`, `FUERA-9`). El código sugiere lo contrario a quien lo lea | Abierto |
| **E-9** | El esquema de la tabla `reservas` está escrito **dos veces**: en `server.js` y en `datos.js` | Un cambio de esquema aplicado en uno solo deja los dos archivos discrepando en silencio | Abierto |
| **E-10** | Los datos que escribe el usuario se interpolan en el HTML sin escapar | No lo delató una prueba: se vio al leer el código. El nombre del cliente y el teléfono viajan tal cual a la lista del día | Abierto |

---

## La señal de la suite

Una suite que pasa no demuestra nada por sí sola. Se rompió el código a propósito, una regla por
vez, para comprobar que la suite lo nota. **Cada mutación se revirtió con `git checkout`
inmediatamente; `server.js` quedó idéntico al commit del proveedor.**

| Mutación aplicada a `server.js` | Pruebas que se cayeron |
|---|---|
| Tarifa diurna: `15000` → `16000` | 9 |
| Umbral de cliente frecuente: `>= 4` → `>= 3` | 1 |
| Se deja de verificar si el bloque está ocupado | 1 |
| La cancelación deja de mirar la fecha | 2 |

Sin mutar: 60 pasan, 0 fallan.

---

## Lo que este documento no hace

Los hallazgos **describen qué no se cumple, no cómo arreglarlo**. El diagnóstico salió de escribir
las pruebas; el remedio es trabajo del turno de refactorización, con la red ya puesta.

Al cerrar un hallazgo se anota aquí su **evidencia de cierre**: qué commit lo cerró, y que su
prueba pasa sin haber sido modificada.

---

## Evidencia de cierre

### C-1 — la tarifa con luz empezaba a las 18:00 · **cerrado**

Commit de **comportamiento**: *«Comportamiento (C-1): la luz enciende a las 17:00, no a las 18:00»*.

El cambio es **una sola línea**: la hora en que enciende la luz pasó de `18` a `17`, dentro de la
única función de tarifa que dejó el commit anterior. El bloque de las 17:00 pasa a cobrarse,
cotizarse y mostrarse a ₡20.000, como pide `RN-19`.

**Sus tres pruebas pasan sin haber sido modificadas.** Lo único que se les tocó fue la marca de
fallo esperado `{ todo: 'HALLAZGO C-1' }`: el nombre, el comentario de qué las haría fallar y la
aserción quedaron letra por letra como estaban. El `git diff` del commit lo muestra: tres líneas
cambiadas en `pruebas/tarifas.test.js`, todas la misma marca.

**La suite antes y después:**

| | Antes | Después |
|---|---|---|
| Pruebas | 71 | 71 |
| En verde | 60 | **63** |
| Marcadas como fallo esperado | 11 | **8** |
| Fallos | 0 | 0 |
| `verificar.sh` | 0 | 0 |

Las tres que se sumaron al verde son exactamente las tres de `C-1`. Las 8 que quedaban marcadas
en ese momento eran `C-2` (4), `C-3` (1), `C-4` (2) y `C-5` (1).

---

### C-2 — el teléfono no se validaba · **cerrado**

Commit de **comportamiento**: *«Comportamiento (C-2): el teléfono es obligatorio y son ocho dígitos»*.

El sistema aceptaba cualquier cosa como teléfono: vacío, de siete dígitos, de nueve, o con
guiones. Ahora se exige lo que dice `RN-13` —presente y exactamente ocho dígitos— y el error se
informa junto a los demás, no en lugar de ellos.

**Sin deuda de estructura en el camino:** la validación ya vivía en un solo lugar, el bloque de
errores de `POST /reservas`. Por eso esta tanda es un único commit, sin paso previo.

**Sus cuatro pruebas pasan sin haber sido modificadas.** El diff sobre `pruebas/validaciones.test.js`
son cuatro líneas, todas la misma marca de fallo esperado.

**La suite antes y después:** de 63 en verde y 8 marcadas, a **67 en verde y 4 marcadas**, con 0
fallos y `verificar.sh` en 0 en los dos lados. Antes de quitar las marcas se corrió la suite con el
arreglo puesto para comprobar que **ninguna prueba en verde se rompió**: seguía dando 63 y 0 fallos.

**Dos decisiones que la especificación no fijaba, y quedan declaradas acá:** el teléfono se recorta
antes de mirarlo, igual que ya se hacía con el nombre del cliente; y «ocho dígitos» se lee literal,
así que `8811-2233` y `+506 88112233` se rechazan.

---

### C-3 — las canceladas contaban para el descuento · **cerrado**

Commit de **comportamiento**: *«Comportamiento (C-3): las canceladas no cuentan para el cliente frecuente»*.

El conteo del mes sumaba también las reservas canceladas, así que un cliente que apartaba cuatro
bloques y cancelaba tres llegaba igual al descuento. La administradora lo dijo sin rodeos:
frecuente es el que juega, no el que aparta (`RN-24`). La consulta ahora cuenta solo las activas.

**Sin deuda de estructura en el camino:** el conteo ya estaba en un solo lugar.

**Su prueba pasa sin haber sido modificada.** El diff sobre `pruebas/cliente-frecuente.test.js` es
una línea: la marca de fallo esperado.

**Lo que había que cuidar y se cuidó:** `RN-26` dice que el precio se fija al registrar y que
cancelar no recalcula nada hacia atrás. El arreglo cambia **a quién se le da el descuento de acá en
adelante**, no los precios ya cobrados. La prueba que vigila eso —*cancelar una reserva no cambia el
precio ya cobrado en otra*— siguió en verde.

**La suite antes y después:** de 67 en verde y 4 marcadas, a **68 en verde y 3 marcadas**, 0 fallos.
Con el arreglo puesto y antes de quitar la marca, la suite seguía dando 67 y 0 fallos: ninguna
prueba en verde se rompió.

---

### E-5 — la tarifa calculada en tres lugares · **pagado**

Commit de **estructura**: *«Estructura (E-5): una sola función de tarifa, en vez de tres»*.

La tarifa quedó en una única función, `tarifaDelBloque(hora)`, con los tres números que antes
estaban repetidos convertidos en constantes con nombre. Los tres sitios que la calculaban —la
grilla de disponibilidad, el registro de la reserva y la cotización previa— ahora la llaman.

**Prueba de que no cambió el comportamiento:** la suite da exactamente lo mismo antes y después
del commit — 71 pruebas, 60 en verde, 0 fallos, las mismas 11 marcadas. `verificar.sh` sale en 0
en los dos lados. Ninguna prueba fue tocada.

**Por qué se pagó esta deuda y no otra:** estaba en el camino directo de `C-1`. Con la tarifa en
tres lugares, corregir la hora de la luz obligaba a acertar el mismo arreglo tres veces; con la
función única, es una sola línea.

---

### E-1, E-2, E-3, E-6 — el sistema no se dejaba arrancar ni fijar · **pagados**

Tres commits de **estructura** seguidos:

1. *«Estructura (E-1, E-2, E-3): el sistema se puede arrancar desde afuera»*
2. *«Estructura (E-6): un solo reloj, y la fecha de registro sale de él»*
3. *«Estructura: el andamiaje de pruebas deja de parchear el sistema»*

Las cuatro deudas eran la misma de fondo: el sistema fijaba en el código su puerto, la ruta de su
base y su reloj, y arrancaba solo al cargarse. Para poder probarlo sin destruir los datos reales, el
andamiaje tenía que **parchear el sistema desde afuera**: reemplazaba la clase `Date`, interceptaba
la carga de `better-sqlite3` y envolvía `listen()`. Setenta líneas de andamio sosteniendo lo que el
sistema no ofrecía.

Ahora los tres salen de configuración —`CANCHA_PUERTO`, `CANCHA_BD`, `CANCHA_AHORA`— **con los
valores de siempre como omisión**: sin variables de entorno el sistema arranca exactamente como
arrancaba. Cargar `server.js` ya no levanta un servidor, y el archivo exporta la aplicación.
`pruebas/soporte/arranque.js` **se borró entero**.

**El desfase de relojes, de regalo.** `creada_en` la escribía SQLite en UTC mientras el resto del
sistema usaba hora local: una reserva hecha el 31 de agosto a las 18:30 quedaba registrada en
setiembre. Ahora la escribe la aplicación con su único reloj. Se pagó **antes** de que `C-4` empiece
a usar esa columna para decidir descuentos.

**Prueba de que no cambió el comportamiento:** la suite da **68 en verde y 3 marcadas, 0 fallos**
en los tres commits, igual que antes de empezar. El diff **no toca ningún archivo de prueba**: solo
`server.js` y el andamiaje de `pruebas/soporte/`.

**Lo que esto destraba:** las reglas con lógica propia —tarifa, descuento, plazo— ya se pueden
probar en unidad, que era el reclamo de `E-1`. Esas pruebas se escriben en su propia tanda.
