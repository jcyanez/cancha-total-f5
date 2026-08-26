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

# --- La pregunta que importa ----------------------------------------------

estado=$(consultar "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_ORG_ID}")

if [ "${estado}" = "200" ]; then
  nombre=$(jq -r '.name // "?"' "${CUERPO}")
  echo "Las tres credenciales de Vercel sirven."
  echo "  Proyecto alcanzado: \"${nombre}\""
  exit 0
fi

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
