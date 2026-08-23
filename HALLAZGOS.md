# Hallazgos

Lo que la suite descubrió al contrastar el sistema entregado contra
[`ESPECIFICACION.md`](ESPECIFICACION.md). **Nada de esto se corrigió al escribir las pruebas**:
cada hallazgo tiene su prueba escrita y marcada como fallo esperado, para que la puerta de
calidad sirva desde el primer día sin ocultar lo que falta.

Se cierran en los turnos de refactorización, **quitando la marca** de la prueba y sin tocar la
prueba misma. El avance se mide contando marcas quitadas.

**Estado al escribir este documento:** 71 pruebas — 60 pasan, 11 marcadas como fallo esperado,
`verificar.sh` sale en 0. El avance de cierre se lleva en [`STATUS.md`](STATUS.md).

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
| **C-1** | `RN-19` — La hora con luz cuesta ₡20.000 **desde las 17:00**: la luz se enciende a las 5 de la tarde y el partido de las 5 ya va con luz | Cobra ₡20.000 **desde las 18:00**. El bloque de las 17:00 lo cobra, lo cotiza y lo muestra a ₡15.000 | `pruebas/tarifas.test.js` → *la hora de las 17:00 cuesta 20.000…*, *una reserva de las 17:00 queda cobrada a 20.000*, *la pantalla de disponibilidad muestra 20.000…* | Abierto |
| **C-2** | `RN-13` — El teléfono es **obligatorio** y tiene **exactamente 8 dígitos** | No se verifica nada: se acepta vacío, más corto, más largo y con caracteres que no son dígitos | `pruebas/validaciones.test.js` → *sin teléfono…*, *un teléfono de siete dígitos…*, *un teléfono de nueve dígitos…*, *un teléfono con letras…* | Abierto |
| **C-3** | `RN-24` — Las reservas **canceladas no cuentan** para volverse cliente frecuente | El conteo del mes incluye las canceladas, así que un cliente que apartó y canceló llega al descuento sin haber jugado | `pruebas/cliente-frecuente.test.js` → *una reserva cancelada no cuenta para volverse cliente frecuente* | Abierto |
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
| **E-1** | `server.js` no exporta nada y llama a `app.listen()` al cargarse | **Ninguna regla se puede probar en unidad.** Toda la suite tuvo que hacerse de integración, lanzando el proceso real. Las reglas con lógica propia —tarifa, descuento, plazo— merecerían pruebas unitarias con casos borde y hoy no las pueden tener | Abierto |
| **E-2** | El puerto está fijo en el código (`const PUERTO = 3000`), sin variable de entorno | Las pruebas no pueden levantar el sistema en un puerto libre: hay que redirigir `listen()` desde afuera (`pruebas/soporte/arranque.js`) | Abierto |
| **E-3** | La ruta de la base de datos está fija (`path.join(__dirname, 'reservas.db')`) | Las pruebas no pueden apuntar a una base propia: hay que interceptar la carga de `better-sqlite3` desde afuera. Sin eso, correr las pruebas destruiría los datos reales | Abierto |
| **E-4** | No hay forma de registrar una reserva con una fecha de registro distinta de «ahora» | La prueba de `RN-23` que mira meses anteriores tiene que escribir directamente en la base, saltándose el camino del negocio y acoplándose al esquema | Abierto |
| **E-5** | **La tarifa se calcula en tres lugares**, con los mismos números repetidos: la grilla de disponibilidad, el registro de la reserva y la cotización previa. No hay una función de tarifa | Está **en el camino directo de C-1**: corregir la hora de la luz obliga a tocar los tres sitios y a acertar en los tres | **Pagado** |
| **E-6** | La regla de las 24 horas lee el reloj del sistema desde adentro de la regla | Sin poder inyectar el instante, la prueba de `RN-27` dependería del día en que se corra. Hubo que congelar el reloj desde afuera. Está **en el camino de C-5** | Abierto |
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
