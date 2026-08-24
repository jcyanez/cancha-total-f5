# Especificación — Cancha Total F5

Sistema de reservas de las dos canchas techadas de fútbol 5 de Cancha Total F5.

## 1. Qué es este documento

El sistema fue construido por un proveedor que no dejó documentación. Este documento **reconstruye
la especificación**: dice qué debe hacer el sistema, no qué hace hoy. Se escribió antes de las
pruebas y **a partir de acá es la fuente de verdad** del proyecto: cada prueba de la suite sale de
una condición de este documento, y toda diferencia entre lo que el documento pide y lo que el
sistema hace es un hallazgo, no un defecto de la prueba.

### Cómo se reconstruyó

Se leyó el código y se extrajo su comportamiento observable en lenguaje del negocio. Esa lista se
revisó punto por punto preguntando qué *debería* pasar, y se contestó con dos fuentes:

| Fuente | Qué significa | Cuándo se usa |
|---|---|---|
| **Administradora** | La descripción del negocio dada por la administradora de Cancha Total F5 | Manda siempre que hable del punto |
| **Sistema actual** | El comportamiento que el sistema entregado ya tiene | Donde la administradora no dice nada |
| **Decisión del cliente** | Una lectura elegida explícitamente ante una ambigüedad de la administradora | Se declara y se justifica en §7 |

Toda afirmación de este documento lleva su fuente declarada. Donde las dos primeras hablan del
mismo punto y no coinciden, **manda la administradora** y la diferencia queda registrada en §7.

### Cómo se lee

Cada regla (`RN-`), comportamiento de pantalla (`PANT-`) y dato registrado (`REG-`) está enunciado
como una condición comprobable, con sus valores y sus bordes exactos. Un enunciado sin su número
—«cobra más de noche» en vez de «cobra ₡20.000 desde las 17:00»— no se puede contrastar ni volver
prueba, y no entra acá.

## 2. Glosario

| Término | Significado |
|---|---|
| **Cancha** | Una de las dos canchas techadas de fútbol 5. Se identifican como cancha 1 y cancha 2 |
| **Bloque** | Una hora de una cancha en un día: la unidad que se alquila. «Cancha 1, 2026-08-20, 19:00» |
| **Reserva** | El apartado de un bloque a nombre de un cliente, con su precio |
| **Reserva activa** | La que está en pie: ocupa su bloque y se cobra |
| **Reserva cancelada** | La que se dejó sin efecto a tiempo: libera su bloque y queda registrada |
| **Hora diurna** | Bloque que empieza entre las 8:00 y las 16:00: se juega con luz natural |
| **Hora con luz** | Bloque que empieza entre las 17:00 y las 21:00: se juega con luz artificial encendida |
| **Cliente frecuente** | El que alcanza el umbral de reservas del mes y recibe descuento (`RN-22`) |
| **Tarifa** | El precio de un bloque antes de cualquier descuento |
| **Precio** | Lo que se le cobra a la reserva: la tarifa, con el descuento aplicado si corresponde |

## 3. Reglas del negocio

### 3.1 Qué se vende

| # | Regla | Fuente |
|---|---|---|
| **RN-1** | Se alquila por bloques de **una hora**. No existe una reserva de dos horas seguidas como unidad: son dos reservas | Administradora |
| **RN-2** | Se vende **todos los días del año**, sin excepción por feriado ni por temporada | Administradora / Sistema actual |
| **RN-3** | El primer bloque del día empieza a las **8:00** y el último a las **21:00**: **catorce bloques por cancha por día** (8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21) | Administradora |
| **RN-4** | Hay **dos canchas**, identificadas como **1** y **2**. Cada reserva es para una sola cancha | Administradora / Sistema actual |
| **RN-5** | Las dos canchas tienen las **mismas tarifas** y los mismos horarios | Sistema actual |

### 3.2 Ocupación de un bloque

| # | Regla | Fuente |
|---|---|---|
| **RN-6** | Un bloque que ya tiene una reserva **activa** no se vuelve a vender. Dos reservas activas no pueden coincidir en cancha, fecha y hora | Administradora |
| **RN-7** | El mismo bloque horario puede venderse en **las dos canchas a la vez**: son bloques distintos | Sistema actual |
| **RN-8** | Cuando una reserva se cancela, **su bloque vuelve a estar disponible** y se puede vender de nuevo | Administradora |
| **RN-9** | Se puede registrar una reserva para una **fecha ya pasada** o para una hora de hoy que ya transcurrió. El sistema no lo impide | Sistema actual |
| **RN-10** | Un mismo cliente puede tener **varias reservas el mismo día**: en el mismo bloque de canchas distintas, o en bloques distintos | Sistema actual |

### 3.3 Datos de una reserva

| # | Regla | Fuente |
|---|---|---|
| **RN-11** | Una reserva lleva **cancha, fecha, hora de inicio, nombre del cliente y teléfono** | Administradora |
| **RN-12** | El **nombre del cliente es obligatorio**. Un nombre formado solo por espacios se trata como ausente | Administradora / Sistema actual |
| **RN-13** | El **teléfono es obligatorio** y tiene **exactamente 8 dígitos**. Es la forma de ubicar al cliente y de reconocerlo como frecuente (`RN-21`) | Administradora |
| **RN-14** | La **cancha** debe ser 1 o 2. Cualquier otro valor se rechaza | Administradora / Sistema actual |
| **RN-15** | La **hora de inicio** debe ser un bloque entero entre **8 y 21** inclusive. 7 y 22 se rechazan; un valor no entero se rechaza | Administradora |
| **RN-16** | La **fecha** se expresa como `AAAA-MM-DD`. Cualquier otro formato se rechaza | Sistema actual |
| **RN-17** | Si algún dato no cumple, **la reserva no se registra** y se informan **todos** los problemas encontrados, no solo el primero | Sistema actual |

### 3.4 Tarifas

| # | Regla | Fuente |
|---|---|---|
| **RN-18** | La **hora diurna cuesta ₡15.000**: bloques que empiezan de **8:00 a 16:00** | Administradora |
| **RN-19** | La **hora con luz cuesta ₡20.000**: bloques que empiezan de **17:00 a 21:00**. La luz se enciende a las 5 de la tarde, así que **el bloque de las 17:00 ya es hora con luz** | Administradora |
| **RN-20** | La tarifa se determina por la **hora de inicio** del bloque, no por la hora en que termina el partido | Sistema actual |

> **Borde exacto:** 16:00 → ₡15.000.  **17:00 → ₡20.000.**

### 3.5 Cliente frecuente

| # | Regla | Fuente |
|---|---|---|
| **RN-21** | El cliente se reconoce por su **teléfono**: dos reservas con el mismo teléfono son del mismo cliente, aunque el nombre esté escrito distinto | Administradora |
| **RN-22** | Es **cliente frecuente** quien llega a **4 o más reservas en el mismo mes**, **contando la que está haciendo** | Administradora |
| **RN-23** | «El mismo mes» es el **mes calendario en que se registra la reserva**, no el mes en que se juega el partido | Decisión del cliente (§7.4) |
| **RN-24** | Las reservas **canceladas no cuentan** para ese conteo: frecuente es el que juega, no el que aparta | Administradora |
| **RN-25** | El cliente frecuente recibe **10% de descuento** sobre la tarifa del bloque (`RN-18`, `RN-19`) | Administradora |
| **RN-26** | El precio se calcula **al registrar la reserva y queda fijo**. Cancelar una reserva no recalcula el precio de ninguna otra, ni hacia atrás ni hacia adelante | Sistema actual |

> **Borde exacto:** con **3** reservas del mes contando la actual → **sin descuento**. Con **4** → **10%**.
> Ejemplos: ₡15.000 → **₡13.500**.  ₡20.000 → **₡18.000**.

### 3.6 Cancelación

| # | Regla | Fuente |
|---|---|---|
| **RN-27** | Se puede cancelar **hasta 24 horas antes de la hora de inicio del partido** | Administradora |
| **RN-28** | Con **menos de 24 horas** de anticipación **no hay cancelación** y se cobra completo. Si el partido es mañana a las 8:00 y ya son las 23:00 de hoy, no hay marcha atrás | Administradora |
| **RN-29** | Una reserva **ya cancelada no se cancela de nuevo**: se informa que ya estaba cancelada | Sistema actual |
| **RN-30** | Cancelar **no borra** la reserva: queda registrada como cancelada, con el precio que tenía | Sistema actual |
| **RN-31** | Cancelar una reserva que no existe se informa como tal, sin efecto sobre ninguna otra | Sistema actual |

> **Borde exacto:** faltan **24 horas o más** para la hora de inicio → **se cancela**.
> Faltan **menos de 24 horas** → **no se cancela**.

## 4. Comportamiento de pantalla

Agrupado por recorrido. Fuente: **Sistema actual**, salvo donde se indique otra cosa.

### 4.1 Consultar la disponibilidad de un día

- **PANT-1** — Para un día se ve, por cada cancha, el estado de sus catorce bloques: **Libre** u **Ocupado**. *(Administradora)*
- **PANT-2** — Un bloque cuya única reserva está cancelada se ve como **Libre** (`RN-8`).
- **PANT-3** — Si no se indica un día, se muestra el **día de hoy**.
- **PANT-4** — La pantalla de inicio muestra, junto al estado de cada bloque, **su tarifa** (`RN-18`, `RN-19`).
- **PANT-5** — Existen además pantallas por cancha que muestran los mismos bloques y su estado, **sin la tarifa**.
- **PANT-6** — Se puede consultar **cualquier fecha**, pasada o futura, sin límite.

### 4.2 Registrar una reserva

- **PANT-7** — El formulario ofrece cancha, fecha, hora de inicio, nombre y teléfono, y solo permite elegir horas dentro del rango de `RN-15`.
- **PANT-8** — Al elegir una hora se muestra un **precio estimado**, que es la **tarifa del bloque sin descuento** (`RN-18`, `RN-19`), aunque al confirmar sí se aplique el descuento que corresponda.
- **PANT-9** — Al registrarse, se confirma con el **número de reserva**, cancha, fecha, hora, cliente y precio, indicando **si se aplicó el descuento** de cliente frecuente.
- **PANT-10** — Si algún dato no cumple, se informan **todos** los problemas juntos (`RN-17`) y no se registra nada.
- **PANT-11** — Si el bloque ya está vendido, se informa **cuál** bloque está ocupado: cancha, fecha y hora.

### 4.3 Ver las reservas de un día

- **PANT-12** — Se listan las reservas del día con **hora, cancha, cliente, teléfono, precio cobrado y estado**. *(Administradora: «la lista de reservas del día con lo que se cobró en cada una»)*
- **PANT-13** — Van ordenadas por **cancha** y, dentro de cada cancha, por **hora**.
- **PANT-14** — Las canceladas se distinguen de las activas y **no ofrecen cancelar**.
- **PANT-15** — Un día sin reservas muestra un **aviso de que no hay ninguna**, no una lista vacía.
- **PANT-16** — Lo que escribe el cliente —su nombre, su teléfono— se muestra **como texto**. Si trae algo que parece una etiqueta, se ve escrito tal cual y **no se interpreta**. *(Decisión del cliente, §7.6)*

## 5. Qué queda registrado

| # | Dato | Fuente |
|---|---|---|
| **REG-1** | Un **número de reserva** único, que identifica la reserva y se le muestra al cliente | Sistema actual |
| **REG-2** | Cancha, fecha, hora de inicio, nombre del cliente y teléfono (`RN-11`) | Administradora |
| **REG-3** | El **precio cobrado**, ya con el descuento aplicado si correspondía, fijo desde el registro (`RN-26`) | Administradora / Sistema actual |
| **REG-4** | El **estado**: activa o cancelada | Administradora |
| **REG-5** | La **fecha y hora en que se registró** la reserva. Es el dato que determina el mes del cliente frecuente (`RN-23`) | Sistema actual |

## 6. Lo que el sistema no hace

Queda **fuera de alcance**. No es un defecto: es el límite declarado del sistema. Nada de esto se
prueba ni se construye salvo que se registre aquí una decisión explícita en contrario.

- **FUERA-1** — No se puede **editar** una reserva: solo registrarla o cancelarla.
- **FUERA-2** — No hay **usuarios ni control de acceso**: cualquiera con la dirección puede registrar y cancelar.
- **FUERA-3** — No queda registro de **quién** registró ni de **quién** canceló una reserva.
- **FUERA-4** — No se puede reservar **dos horas seguidas** como un solo partido (`RN-1`).
- **FUERA-5** — No se envía **confirmación** por mensaje ni por correo.
- **FUERA-6** — No se puede **buscar** una reserva por cliente ni por teléfono.
- **FUERA-7** — No hay **reportes** de facturación ni de ocupación.
- **FUERA-8** — No hay **tarifas ni bloqueos por feriado**.
- **FUERA-9** — No hay **tarifas de temporada alta**.
- **FUERA-10** — No hay **cobro en línea** ni registro de pagos: el precio es lo que se cobra en la cancha.

## 7. Dónde las fuentes hablan del mismo punto

Los cinco puntos en que la descripción de la administradora y el comportamiento del sistema
entregado dicen cosas distintas, y cuál quedó. **En los cuatro primeros manda la administradora**;
el quinto es una ambigüedad de su descripción, resuelta por decisión del cliente.

### 7.1 Hora en que empieza la tarifa con luz — `RN-19`

- **Administradora:** «Desde que se enciende la luz cuesta ₡20.000 — y la luz se enciende a las 5 de la tarde: el partido de las 5 ya va con luz.» → **desde las 17:00**.
- **Sistema actual:** cobra ₡20.000 desde las 18:00; el bloque de las 17:00 lo cobra a ₡15.000.
- **Queda:** la administradora. **Desde las 17:00.**

### 7.2 Obligatoriedad y formato del teléfono — `RN-13`

- **Administradora:** «El teléfono es obligatorio y son 8 dígitos.»
- **Sistema actual:** el teléfono se acepta vacío y con cualquier contenido; no se verifica nada.
- **Queda:** la administradora. **Obligatorio, exactamente 8 dígitos.**

### 7.3 Qué reservas cuentan para el cliente frecuente — `RN-24`

- **Administradora:** «Las canceladas no cuentan: frecuente es el que juega, no el que aparta.»
- **Sistema actual:** el conteo incluye las canceladas.
- **Queda:** la administradora. **Las canceladas no cuentan.**

### 7.4 Qué mes se cuenta para el cliente frecuente — `RN-23`

- **Administradora:** «cuatro o más reservas en el mismo mes, contando la que está haciendo.» No aclara si el mes es el del partido o el del apartado: **la descripción es ambigua**.
- **Sistema actual:** cuenta el mes de la **fecha del partido**.
- **Queda:** **decisión del cliente** — el mes es el del **registro de la reserva**. El sistema ya guarda la fecha de registro (`REG-5`), pero hoy no la usa para esto.
- **Por qué se declara aparte:** no es una corrección de la administradora, sino una de las dos lecturas posibles de su frase, elegida explícitamente y sostenida por las pruebas de este documento.

### 7.5 Plazo de cancelación — `RN-27`, `RN-28`

- **Administradora:** «Se puede cancelar hasta 24 horas antes de la hora del partido. Con menos de 24 horas no hay cancelación y se cobra completo: si el partido es mañana a las 8 de la mañana y ya son las 11 de la noche, no hay marcha atrás.»
- **Sistema actual:** cancela cuando la **fecha** del partido es posterior a hoy, sin mirar la hora del partido ni la hora actual. Con ese criterio, el ejemplo de la administradora **sí** se cancelaría, y una reserva de hoy a las 21:00 consultada a las 8:00 de la mañana **no** se cancelaría.
- **Queda:** la administradora. **24 horas antes de la hora de inicio.**

### 7.6 Qué pasa con lo que escribe el cliente al mostrarlo — `PANT-16`

- **Administradora:** **no habla del tema.** Por la regla de este documento, donde ella no dice nada manda el sistema actual, así que el comportamiento de hoy quedaría declarado correcto.
- **Sistema actual:** mete el nombre y el teléfono en la pantalla **sin escaparlos**. Un cliente llamado `<b>Ana</b>` sale en negrita; uno cuyo nombre trae una etiqueta de guion sale ejecutándose en el navegador de quien mire la lista del día.
- **Queda:** **decisión del cliente** — se muestra como texto. Se aparta del comportamiento actual **a propósito**, porque el silencio de la administradora acá no es una elección de negocio: nadie le preguntó si quería que el nombre de un cliente pudiera ejecutar código en la computadora de la recepción.
- **Por qué se declara aparte:** es la única condición de este documento que **contradice al sistema actual sin que la administradora lo haya pedido**. Se deja escrita, con su fuente, para que se vea que es una decisión tomada y no un descuido.

## 8. Decisiones que este documento no toma

- El **motor de base de datos** es SQLite y así se queda: es una condición del encargo, no una decisión de esta especificación.
- La **forma interna del código** —cómo se organiza, qué funciones existen, dónde vive cada regla— no es materia de este documento. Las condiciones de acá describen comportamiento observable, no estructura.
