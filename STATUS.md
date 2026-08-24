# Estado del trabajo

**No queda nada pendiente.** El encargo está terminado: la red puesta, los hallazgos por escrito y
cerrados, y la deuda de estructura pagada. Encima de eso, y pedida aparte, va una capa de
presentación: [más abajo](#después-de-la-entrega-la-capa-visual).

**Documentos:** [ESPECIFICACION.md](ESPECIFICACION.md) · [HALLAZGOS.md](HALLAZGOS.md) · [README.md](README.md)

---

## Marcador final

| | |
|---|---|
| **Pruebas** | 87 — **las 87 pasan, ninguna marcada como fallo esperado** |
| **Puerta** | `./verificar.sh` sale en **0** · hook `Stop` instalado y comprobado |
| **Hallazgos de comportamiento** | 6 · **los seis cerrados** |
| **Hallazgos de estructura** | 10 · **las diez pagadas** (`E-4` en parte, `E-10` reclasificada como `C-6`) |
| **Commits propios** | 21 encima del commit del proveedor `65ce4b4` |

Cada cierre tiene su evidencia en [HALLAZGOS.md](HALLAZGOS.md): qué commit lo cerró, qué decía la
suite antes y después, y que su prueba pasa **sin haber sido modificada**.

---

## Después de la entrega: la capa visual

El encargo del caso quedó cerrado en el commit 20. Lo que sigue es **una capa de presentación
encima**, pedida aparte: cómo se ve y cómo se siente el sistema, sin tocar qué hace.

| | |
|---|---|
| **Alcance** | Solo presentación. Ninguna ruta nueva, ningún campo nuevo, ninguna dependencia nueva. |
| **Comportamiento** | Sin cambios. Los mismos textos, precios, mensajes de error, orden y rutas que fija [ESPECIFICACION.md](ESPECIFICACION.md). |
| **Suite** | 87 antes, 87 después. **Idéntica.** Ningún archivo de `pruebas/` aparece en el diff. |
| **Archivos tocados** | Uno: `server.js`. |

Se trabajó en seis capas, verificando después de cada una: tokens → iconos → píldoras → avisos →
formulario → responsive.

### Tres defectos que la suite no podía ver

Las pruebas garantizan el comportamiento, no la distribución. Aparecieron mirando el sistema
renderizado de verdad, con navegador:

1. **La regla ámbar salía con joroba.** El navegador recorta el fondo de la fila con el
   `border-radius` de cada celda, así que la línea de la luz —y los separadores— se cortaban justo
   encima de cada píldora. La píldora pasó del fondo del `<td>` a un pseudo-elemento.
2. **La lista del día scrolleaba de lado en un teléfono.** El rótulo «Acciones», invisible y
   posicionado en absoluto, no tenía ancestro posicionado: se colgaba del documento en vez del
   marco con scroll, y estiraba la página a 636 px dentro de un viewport de 375.
3. **Inicio desbordaba 2 px a 320 px de ancho.** Los hijos de la grilla de canchas no encogían por
   debajo del ancho mínimo de su tabla.

Los tres se cierran con CSS. Para que no vuelvan sin avisar, la medición quedó como herramienta
repetible: `capturas/herramienta/medir-ancho.js` en el repositorio del curso, que recorre las
pantallas a un ancho dado y nombra al que se escapa del recorte. A 320, 375, 768 y 1100 px:
ninguna pantalla scrollea de lado.

### Lo que quedó afuera, y por qué

**El error junto a su campo.** Hoy la validación devuelve una *página* de error sin formulario.
Poner cada mensaje al lado de su campo obliga a volver a dibujar el formulario con lo que la
persona había tecleado, y eso es cambio de comportamiento observable: fuera de alcance. Lo que sí
se entregó es el patrón que WCAG pide para un envío con varios errores —un resumen con
`role="alert"`, icono, jerarquía y una marca por problema—, con los mensajes palabra por palabra
como estaban. Queda anotado como lo que es: deuda declarada, no disimulada.

---

## Lo que se hizo, en orden

El historial se lee de abajo hacia arriba y cuenta la historia completa. Ningún commit mezcla
estructura con comportamiento.

| # | Commit | Clase |
|---|---|---|
| 1 | La red de seguridad y la puerta, antes de tocar el código | red |
| 2 | Una sola función de tarifa, en vez de tres | estructura · `E-5` |
| 3 | La luz enciende a las 17:00, no a las 18:00 | comportamiento · `C-1` |
| 4 | Anotar el estado tras la primera tanda | documentación |
| 5 | El teléfono es obligatorio y son ocho dígitos | comportamiento · `C-2` |
| 6 | Las canceladas no cuentan para el cliente frecuente | comportamiento · `C-3` |
| 7 | El sistema se puede arrancar desde afuera | estructura · `E-1` `E-2` `E-3` |
| 8 | Un solo reloj, y la fecha de registro sale de él | estructura · `E-6` |
| 9 | El andamiaje de pruebas deja de parchear el sistema | estructura |
| 10 | La siembra de pruebas usa el reloj de las pruebas | estructura · `E-4` |
| 11 | El mes que cuenta es el del registro | comportamiento · `C-4` |
| 12 | El plazo se mide contra la hora del partido | comportamiento · `C-5` |
| 13 | Se borra el código muerto | estructura · `E-8` |
| 14 | Una sola pantalla de disponibilidad por cancha | estructura · `E-7` |
| 15 | El esquema deja de estar escrito dos veces | estructura · `E-9` |
| 16 | La especificación se pronuncia sobre el HTML escapado | red · `C-6` |
| 17 | Lo que escribe el cliente se muestra como texto | comportamiento · `C-6` |
| 18 | La regla del descuento sale del manejador | estructura |
| 19 | Las pruebas de unidad que `E-1` tenía trabadas | red |
| 20 | El cierre: README y marcador final | documentación |

---

## Las reglas que se respetaron

Se dejan escritas porque son la parte del trabajo que no se ve en el resultado, solo en el camino.

- **Ningún commit mezcla estructura con comportamiento.** En los ocho commits de estructura la suite
  dio **exactamente lo mismo antes y después**, y el diff no tocó ningún archivo de prueba.
- **Ningún hallazgo se cerró tocando su prueba.** En cada cierre, el diff sobre el archivo de pruebas
  es una línea por prueba: la marca de fallo esperado. El nombre, el comentario de qué la haría
  fallar y la aserción quedaron letra por letra como estaban.
- **El valor esperado nunca salió de correr el código.** Salió de `ESPECIFICACION.md`. Y cuando la
  especificación no hablaba de algo —el HTML escapado— se la amplió **primero**, con su fuente
  declarada, y se vio la prueba fallar antes de mover una línea del sistema.
- **La señal de la suite se comprobó rompiendo el código a propósito**, y revirtiendo cada mutación
  enseguida.
- **No se agregaron funciones nuevas** ni se cambió el stack. SQLite se queda.

## Lo único que quedó a medias, y por qué

`E-4` está pagada **en parte**. El sistema ya permite registrar con otra fecha de registro, que es lo
que el hallazgo reclamaba; pero la siembra de las pruebas sigue escribiendo en la tabla en vez de
pasar por el camino del negocio. Hacerlo bien la volvería asíncrona y obligaría a **modificar las
pruebas**, y eso no se hace. Queda anotado como lo que es: media deuda, declarada y no disimulada.
