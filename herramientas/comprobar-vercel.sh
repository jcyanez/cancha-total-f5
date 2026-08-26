#!/usr/bin/env bash
# Comprueba las tres credenciales de Vercel contra la API, antes de intentar
# desplegar. Escrito una sola vez y usado por los dos workflows de despliegue.
#
# Existe porque los errores de la CLI no nombran al culpable. Con un token
# vencido, un ORG_ID de otra cuenta o un PROJECT_ID mal copiado, `vercel pull`
# dice cosas como "User not found" tres pasos despues de la causa, y quien lo
# lee no sabe cual de los cinco secretos revisar.
#
# La pregunta que importa es una sola y es concreta: ¿con estas tres
# credenciales se alcanza ESE proyecto? Eso es exactamente lo que necesita
# `vercel pull`, asi que es lo primero que se pregunta. Si la respuesta es si,
# no hace falta averiguar nada mas.
#
# Solo cuando falla se baja por una escalera para aislar la causa, y se baja
# usando el mismo endpoint con menos datos cada vez. Preguntarle a un endpoint
# distinto -/v2/user, por ejemplo- confunde "el token no sirve" con "ese
# endpoint ya no existe", y devuelve un diagnostico equivocado con total
# seguridad.
#
#   /v9/projects/<pid>?teamId=<oid>   200 -> las tres bien
#   /v9/projects?teamId=<oid>         200 -> token y ORG_ID bien, PROJECT_ID mal
#   /v9/projects                      200 -> token bien, ORG_ID mal
#   ninguna                               -> el token
#
# No imprime ningun valor de secreto: solo codigos de estado HTTP y el campo
# error.code de la respuesta.

set -uo pipefail

falta() {
  echo "::error title=Falta un secreto::$1 esta vacio. Cargalo en GitHub -> Settings -> Secrets and variables -> Actions."
  exit 1
}

[ -n "${VERCEL_TOKEN:-}" ]      || falta VERCEL_TOKEN
[ -n "${VERCEL_ORG_ID:-}" ]     || falta VERCEL_ORG_ID
[ -n "${VERCEL_PROJECT_ID:-}" ] || falta VERCEL_PROJECT_ID

CUERPO=respuesta.json

# Devuelve el codigo HTTP y deja el cuerpo en $CUERPO.
consultar() {
  curl -sS -o "${CUERPO}" -w '%{http_code}' \
    -H "Authorization: Bearer ${VERCEL_TOKEN}" \
    "$1"
}

detalle() {
  local codigo
  codigo=$(jq -r '.error.code // .error.message // empty' "${CUERPO}" 2>/dev/null)
  if [ -n "${codigo}" ]; then
    echo "${codigo}"
    return
  fi
  # No siempre contesta JSON. Se muestra el cuerpo recortado, y con las cadenas
  # largas tapadas por si trae algo que no deba salir en un log publico.
  tr -d '\n' < "${CUERPO}" | sed -E 's/[A-Za-z0-9_.-]{24,}/***/g' | cut -c1-160
}

limpiar() { rm -f "${CUERPO}"; }
trap limpiar EXIT

# --- Cuadro de situacion ---------------------------------------------------
#
# Se imprime siempre, pase o falle. Un "alcanzo el proyecto" a secas no alcanza:
# la API puede ignorar un teamId que no reconoce y devolver el proyecto igual,
# y entonces la sonda da por buena una terna con el ORG_ID equivocado -que es
# justo lo que despues hace fallar a la CLI.
#
# Ninguna linea imprime el valor de un secreto. Del ORG_ID solo se dice si
# coincide o no con los equipos que el token ve, y eso se compara adentro.

estado_con_equipo=$(consultar "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_ORG_ID}")
nombre_proyecto=$(jq -r '.name // "?"' "${CUERPO}" 2>/dev/null)

estado_sin_equipo=$(consultar "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}")
estado_equipo=$(consultar "https://api.vercel.com/v2/teams/${VERCEL_ORG_ID}")

# ¿El ORG_ID guardado es uno de los equipos que este token alcanza?
consultar "https://api.vercel.com/v2/teams?limit=20" > /dev/null
equipos=$(jq -r '.teams[]? | .id + " (" + (.slug // "?") + ")"' "${CUERPO}" 2>/dev/null)
if jq -e --arg oid "${VERCEL_ORG_ID}" '.teams[]? | select(.id == $oid)' "${CUERPO}" > /dev/null 2>&1; then
  coincide="SI"
else
  coincide="NO"
fi

echo "Cuadro de situacion de las credenciales de Vercel:"
echo "  proyecto con teamId .......... ${estado_con_equipo}"
echo "  proyecto sin teamId .......... ${estado_sin_equipo}"
echo "  el ORG_ID existe como equipo . ${estado_equipo}"
echo "  el ORG_ID esta entre los equipos que ve el token: ${coincide}"
echo "  equipos que ve el token:"
if [ -n "${equipos}" ]; then
  echo "${equipos}" | sed 's/^/    - /'
else
  echo "    (ninguno)"
fi
echo ""

# --- La pregunta que importa ----------------------------------------------
#
# Las dos condiciones juntas: el proyecto se alcanza Y el ORG_ID es de verdad
# un equipo de este token. Sin la segunda, la CLI falla despues con
# "Could not retrieve Project Settings" y el mensaje no dice por que.

if [ "${estado_con_equipo}" = "200" ] && [ "${coincide}" = "SI" ]; then
  echo "Las tres credenciales de Vercel sirven."
  echo "  Proyecto alcanzado: \"${nombre_proyecto}\""
  exit 0
fi

if [ "${estado_con_equipo}" = "200" ] && [ "${coincide}" = "NO" ]; then
  echo "::error title=VERCEL_ORG_ID no es un equipo de este token::La API devolvio el proyecto \"${nombre_proyecto}\", pero ignorando el teamId: el ORG_ID guardado no esta entre los equipos que este token alcanza. La CLI si lo valida, y por eso falla despues con 'Could not retrieve Project Settings'. Usa uno de los ids listados arriba: es el Team ID de la cuenta donde vive el proyecto (clic en el nombre de la cuenta arriba a la izquierda -> Settings -> General -> Team ID)."
  exit 1
fi

estado="${estado_con_equipo}"

echo "No se alcanzo el proyecto: la API respondio ${estado} ($(detalle))."
echo "Bajando la escalera para aislar cual de las tres credenciales falla..."
echo ""

# --- Escalon 1: ¿el token ve la cuenta? ------------------------------------

estado_cuenta=$(consultar "https://api.vercel.com/v9/projects?teamId=${VERCEL_ORG_ID}&limit=1")
echo "  con token + ORG_ID:  ${estado_cuenta}"

if [ "${estado_cuenta}" = "200" ]; then
  echo ""
  echo "::error title=VERCEL_PROJECT_ID esta mal::El token y el ORG_ID sirven -la API lista los proyectos de esa cuenta- pero el PROJECT_ID no corresponde a ninguno. Copialo de Project Settings -> General -> Project ID: empieza con prj_ y NO es el nombre del proyecto."
  exit 1
fi

# --- Escalon 2: ¿el token sirve, sin decirle a que cuenta? -----------------

estado_token=$(consultar "https://api.vercel.com/v9/projects?limit=1")
echo "  con token solo:      ${estado_token}"

if [ "${estado_token}" = "200" ]; then
  echo ""
  echo "::error title=VERCEL_ORG_ID esta mal::El token sirve, pero con ese ORG_ID la API no responde (${estado_cuenta}). El ORG_ID es el Team ID de la cuenta donde vive el proyecto: clic en el nombre de la cuenta arriba a la izquierda -> Settings -> General -> Team ID. Empieza con team_."
  exit 1
fi

# --- Escalon 3: no era ninguno de los dos ----------------------------------

echo ""
echo "::error title=VERCEL_TOKEN no sirve::La API rechaza el token incluso sin indicarle una cuenta (${estado_token}: $(detalle)). El token no existe, vencio, o fue borrado despues de crearlo. Crea uno nuevo en https://vercel.com/account/tokens -- Scope: la cuenta donde esta el proyecto, Expiration: No Expiration -- copialo con el boton de copiar (no seleccionandolo con el mouse) y volve a cargar el secreto con: gh secret set VERCEL_TOKEN --repo jcyanez/cancha-total-f5"
exit 1
