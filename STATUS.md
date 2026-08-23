# Lo que queda pendiente

Checklist vivo del Caso Práctico 5. **Solo contiene trabajo sin hacer**: cuando un paso se cierra,
se borra de acá y su evidencia queda en el documento que le corresponde.

**Documentos:** [ESPECIFICACION.md](ESPECIFICACION.md) · [HALLAZGOS.md](HALLAZGOS.md) · [README.md](README.md)

**Entrega:** martes 25 de agosto de 2026, al inicio de la Sesión 6.

---

## Dónde estamos parados

| | |
|---|---|
| **Pruebas** | 71 — 67 pasan, **4 marcadas como fallo esperado** |
| **Puerta** | `./verificar.sh` sale en **0** · hook `Stop` instalado |
| **Hallazgos de comportamiento** | 5 · 2 cerrados (C-1, C-2) · **3 abiertos**: C-3, C-4, C-5 |
| **Hallazgos de estructura** | 10 · 1 pagado (E-5) · **9 abiertos** |
| **Commits propios** | 5 encima de `65ce4b4` |

El mínimo que exige la consigna **ya está cumplido** desde la Tanda 1. Todo lo que sigue es mejora
voluntaria del encargo.

---

## Las cuatro decisiones que fijan este plan

Tomadas con el cliente antes de escribir una línea. Quedan acá porque explican **por qué** el plan
es este y no otro.

1. **Se pagan las nueve deudas de estructura**, incluida la tríada de testabilidad `E-1`/`E-2`/`E-3`.
   Va más allá del criterio del curso —*pagar solo la deuda que está en el camino*—, así que cada
   commit de estructura tiene que **demostrar** que no cambió nada: misma cuenta de la suite antes y
   después, y **ningún archivo de prueba tocado**. El andamiaje de `pruebas/soporte/` sí puede
   cambiar; las pruebas, no.
2. **Un solo reloj en la aplicación.** Hoy hay dos: `hoyISO()` lee la hora local de Node y
   `creada_en` la escribe SQLite en UTC. En Costa Rica eso graba una reserva del 31 de agosto a las
   18:30 como registrada en setiembre. Se unifica **antes** de que C-4 empiece a usar esa columna.
3. **E-10 se cierra ampliando la especificación.** Escapar el HTML cambia lo que sale por pantalla:
   es comportamiento, no estructura. Primero se agrega la condición a `ESPECIFICACION.md` con su
   fuente declarada, después su prueba en rojo, y recién entonces el arreglo.
4. **Se trabaja de corrido**, pero cada commit queda con su evidencia para poder auditar el
   historial al final.

## Reglas de juego

- **Ningún commit mezcla estructura con comportamiento.**
- **En un commit de estructura la suite da exactamente lo mismo antes y después.**
- **Un hallazgo se cierra haciendo pasar su prueba sin tocarla.**
- **No se agregan funciones nuevas** ni se cambia el stack. SQLite se queda.
- **`verificar.sh` sale en 0 al entregar.**

---

## Marcador esperado, tanda por tanda

Sirve de contrato: si una tanda no deja el marcador que dice acá, algo salió distinto de lo previsto
y hay que parar a mirarlo antes de seguir.

| Tanda | Qué cierra | Commits | Verde | Marcadas |
|---|---|---|---|---|
| — | *estado actual* | — | 67 | 4 |
| **3** | C-3 canceladas | 1 comportamiento | 68 | 3 |
| **4** | E-1 E-2 E-3 E-6 testabilidad y reloj | 3 estructura | 68 | 3 |
| **5** | E-4 + C-4 mes de registro | 1 estructura + 1 comportamiento | 70 | 1 |
| **6** | C-5 plazo de cancelación | 1 comportamiento | 71 | 0 |
| **7** | E-7 E-8 E-9 limpieza | 3 estructura | 71 | 0 |
| **8** | E-10 → C-6 HTML escapado | 1 de red + 1 comportamiento | 72 | 0 |
| **9** | pruebas unitarias que destrabó E-1 | 1 de red | 72+N | 0 |

---

## Tanda 3 · C-3 — las canceladas cuentan para frecuente

- [ ] El conteo del mes excluye las canceladas (`RN-24`)
- [ ] Comprobar que **no** toca `RN-26`: cancelar no recalcula el precio ya cobrado de otra reserva
- [ ] Quitar la marca de su prueba
- [ ] Suite: **68 en verde, 3 marcadas** · evidencia en `HALLAZGOS.md`
- [ ] Commit de comportamiento

---

## Tanda 4 · E-1 E-2 E-3 E-6 — la tríada de testabilidad y el reloj

Tres commits de estructura seguidos. **Ninguno cambia comportamiento**: la suite tiene que dar 68 en
verde y 3 marcadas en los tres, y el diff no puede tocar ninguna prueba.

**Commit 1 — la aplicación se puede arrancar desde afuera** (`E-1`, `E-2`, `E-3`)

- [ ] `server.js` deja de llamar a `app.listen()` al cargarse y exporta lo necesario para arrancarlo
- [ ] Puerto y ruta de la base salen de configuración, con los valores de hoy como omisión: 3000 y `reservas.db`
- [ ] El andamiaje deja de interceptar `listen()` y la carga de `better-sqlite3`
- [ ] `npm start` sigue levantando el sistema en el 3000 exactamente igual

**Commit 2 — un solo reloj** (`E-6`)

- [ ] Una función `ahora()` es la única que lee el reloj, y se puede fijar desde afuera
- [ ] `hoyISO()` pasa a leerla en vez de construir su propio `new Date()`
- [ ] `creada_en` la escribe **la aplicación** con ese reloj, en vez del valor por omisión de SQLite
- [ ] Con eso muere el desfase UTC/local de la frontera de mes, antes de que C-4 use la columna
- [ ] El andamiaje deja de reemplazar la clase `Date` a la fuerza

**Commit 3 — el andamiaje sin ataduras**

- [ ] `pruebas/soporte/` ya no necesita parches ni `--require`: arranca el sistema por la puerta de entrada
- [ ] Comprobar que ninguna prueba quedó dependiendo del orden, del reloj real ni de otra prueba

## Tanda 5 · E-4 + C-4 — el mes que cuenta es el del registro

**Paso 1 · Estructura (`E-4`)** — la prueba no debería escribir SQL a mano

- [ ] `sembrarConFechaDeRegistro(...)` **conserva su nombre y su firma**, pero por dentro registra por el
      camino del negocio con el reloj puesto en el pasado, en vez de escribir directo en la tabla
- [ ] Con eso desaparece una dependencia oculta del reloj real que hoy tienen esas pruebas
- [ ] Ninguna prueba cambia · suite **68 en verde, 3 marcadas**
- [ ] Commit de estructura

**Paso 2 · Comportamiento (`C-4`)**

- [ ] El conteo del mes sale de la fecha de registro, no de la fecha del partido (`RN-23`)
- [ ] Quitar la marca de sus **2** pruebas · suite **70 en verde, 1 marcada**
- [ ] Evidencia en `HALLAZGOS.md` · commit de comportamiento

## Tanda 6 · C-5 — el plazo de cancelación

`E-6` ya quedó pagado en la Tanda 4, así que acá solo hay comportamiento.

- [ ] La regla compara el **instante de inicio del partido** contra `ahora()`, y exige 24 horas o más (`RN-27`, `RN-28`)
- [ ] Las 24 horas justas **sí** se cancelan; 22 horas, no — son dos pruebas que ya existen
- [ ] Quitar la marca de su prueba · suite **71 en verde, 0 marcadas**
- [ ] Evidencia en `HALLAZGOS.md` · commit de comportamiento

---

## Tanda 7 · E-7 E-8 E-9 — la limpieza que quedaba

Tres commits de estructura. La suite da lo mismo en los tres: **71 en verde, 0 marcadas**.

- [ ] `E-7` — los dos manejadores de disponibilidad por cancha dejan de ser copia literal uno del otro
- [ ] `E-8` — se borra el código muerto: la función de feriados y las tarifas de temporada alta comentadas. La especificación ya declara que no existen (`FUERA-8`, `FUERA-9`)
- [ ] `E-9` — el esquema de la tabla deja de estar escrito dos veces; `server.js` y `datos.js` leen el mismo

## Tanda 8 · E-10 → C-6 — el HTML sin escapar

Cambia de clase: deja de ser deuda de estructura y pasa a ser hallazgo de comportamiento, porque la
especificación empieza a hablar del tema. El cambio de clase se documenta en `HALLAZGOS.md`.

**Commit 1 — la red primero**

- [ ] Nueva condición en `ESPECIFICACION.md`: lo que escribe el cliente se muestra **como texto**, nunca se interpreta como HTML. Fuente declarada: decisión del cliente, con su apartado en la §7 igual que se hizo con `RN-23`
- [ ] Su prueba: un cliente cuyo nombre lleva etiquetas no puede inyectar nada en la lista del día
- [ ] Verla **fallar**, y dejarla marcada con el número del hallazgo · suite **71 en verde, 1 marcada**

**Commit 2 — el arreglo**

- [ ] Escapar los valores del usuario al armar el HTML
- [ ] Quitar la marca · suite **72 en verde, 0 marcadas** · evidencia en `HALLAZGOS.md`

## Tanda 9 · las pruebas unitarias que E-1 destrabó

Sin esto, pagar `E-1` queda a medias: se pagó para poder probar en unidad y no se probó.

- [ ] Pruebas **de unidad** con casos borde para la tarifa, el descuento de frecuente y el plazo de cancelación
- [ ] Cada una declara su nivel y qué cambio en el código la haría fallar
- [ ] Las de integración que ya existen **se quedan**: cubren el recorrido del negocio, que es otra cosa

---

## Cierre de la entrega

- [ ] `README.md` actualizado: cómo arrancar, cómo recrear los datos, cómo correr la verificación y qué significan sus códigos de salida
- [ ] `HALLAZGOS.md` con la evidencia de cierre de cada hallazgo cerrado y cada deuda pagada
- [ ] Este `STATUS.md` con el marcador final
- [ ] `./verificar.sh` sale en 0 y la aplicación arranca según el `README.md`
- [ ] Revisado commit por commit que ninguno mezcla estructura con comportamiento
- [ ] Revisado que ninguna prueba fue modificada para hacer pasar un hallazgo
- [ ] `git push` a `origin/main` y confirmación de que quedó sincronizado
