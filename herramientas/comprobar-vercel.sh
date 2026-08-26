#!/usr/bin/env bash
# Comprueba las tres credenciales de Vercel contra la API, antes de intentar
# desplegar. Escrito una sola vez y usado por los dos workflows de despliegue.
#
# Existe porque los errores de la CLI no nombran al culpable: con un ORG_ID
# equivocado, `vercel pull` dice "Could not retrieve Project Settings" tres
# pasos despues de la causa, y quien lo lee no sabe cual de los cinco secretos
# revisar. Este script lo dice, y cuando puede, dice el valor correcto.
#
# La idea es una sola: al proyecto se le pregunta por si mismo, sin decirle a
# que cuenta pertenece. Si el token lo alcanza, la respuesta trae en accountId
# el id de la cuenta dueña -y ese ES el orgId que la CLI espera-. Asi no hay que
# adivinar si la cuenta es personal o un equipo: lo contesta la API.
#
# Eso resuelve la trampa que costo varias corridas: preguntando
# /v9/projects/<pid>?teamId=<oid>, la API devuelve 200 aunque el teamId sea
# equivocado -lo ignora, porque el token alcanza el proyecto por otra via-. La
# CLI si lo valida. Comparar contra accountId es lo unico que distingue los dos
# casos.
#
# No imprime el valor de ningun secreto. Si imprime el accountId cuando hay que
# corregirlo: es un identificador de cuenta, no una credencial -viaja en
# .vercel/project.json, un archivo que se commitea en miles de repositorios- y
# sin un token no da acceso a nada.

set -uo pipefail

CUERPO=respuesta.json
trap 'rm -f "${CUERPO}"' EXIT

falta() {
  echo "::error title=Falta un secreto::$1 esta vacio. Cargalo en GitHub -> Settings -> Secrets and variables -> Actions."
  exit 1
}

[ -n "${VERCEL_TOKEN:-}" ]      || falta VERCEL_TOKEN
[ -n "${VERCEL_ORG_ID:-}" ]     || falta VERCEL_ORG_ID
[ -n "${VERCEL_PROJECT_ID:-}" ] || falta VERCEL_PROJECT_ID

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
  # No siempre contesta JSON. Cuerpo recortado, con las cadenas largas tapadas.
  tr -d '\n' < "${CUERPO}" | sed -E 's/[A-Za-z0-9_.-]{24,}/***/g' | cut -c1-160
}

# --- 1. El proyecto, y de paso quien es su dueño ---------------------------

estado=$(consultar "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}")

if [ "${estado}" != "200" ]; then
  # No se alcanza el proyecto. ¿Es el token o es el PROJECT_ID?
  estado_lista=$(consultar "https://api.vercel.com/v9/projects?limit=1")

  if [ "${estado_lista}" = "200" ]; then
    echo "::error title=VERCEL_PROJECT_ID esta mal::El token sirve -la API lista proyectos- pero con ese PROJECT_ID no hay ninguno (${estado}). Copialo de Project Settings -> General -> Project ID: empieza con prj_ y NO es el nombre del proyecto."
  else
    echo "::error title=VERCEL_TOKEN no sirve::La API rechaza el token (${estado_lista}: $(detalle)). El token no existe, vencio, o fue borrado. Crea uno nuevo en https://vercel.com/account/tokens -- Scope: la cuenta donde esta el proyecto, Expiration: No Expiration -- copialo con el boton de copiar y volve a cargarlo con: gh secret set VERCEL_TOKEN --repo jcyanez/cancha-total-f5"
  fi
  exit 1
fi

nombre=$(jq -r '.name // "?"' "${CUERPO}")
cuenta=$(jq -r '.accountId // empty' "${CUERPO}")

echo "Proyecto alcanzado: \"${nombre}\""

if [ -z "${cuenta}" ]; then
  # La API no dijo de quien es. No se puede validar el ORG_ID, pero tampoco hay
  # motivo para detener el despliegue: la CLI lo dira si esta mal.
  echo "Aviso: la respuesta no trae accountId, asi que el ORG_ID no se pudo verificar."
  exit 0
fi

# --- 2. ¿El ORG_ID guardado es el dueño del proyecto? ---------------------

if [ "${VERCEL_ORG_ID}" != "${cuenta}" ]; then
  echo ""
  echo "El VERCEL_ORG_ID guardado NO es la cuenta dueña de este proyecto."
  echo ""
  echo "  El valor correcto, tal como lo espera la CLI, es:"
  echo ""
  echo "      ${cuenta}"
  echo ""
  echo "  Cargalo asi:"
  echo ""
  echo "      gh secret set VERCEL_ORG_ID --repo jcyanez/cancha-total-f5"
  echo ""
  echo "::error title=VERCEL_ORG_ID esta mal::El proyecto \"${nombre}\" pertenece a la cuenta ${cuenta}, y el ORG_ID guardado es otro. Ojo con la trampa: /v9/projects?teamId=<oid> devuelve 200 aunque el teamId sea equivocado, porque la API lo ignora cuando el token alcanza el proyecto de todos modos. El valor correcto esta impreso en el log de este paso."
  exit 1
fi

echo "VERCEL_ORG_ID coincide con la cuenta dueña del proyecto."

# --- 3. ¿El token alcanza la cuenta, o solo ese proyecto? -----------------
#
# Poder leer el proyecto no alcanza para desplegar. La CLI, antes de cualquier
# cosa, resuelve la identidad del token: "Loading teams..." y despues los datos
# del usuario. Un token creado con alcance de UN PROYECTO -el desplegable Scope
# del panel ofrece la cuenta y tambien proyectos sueltos- puede leer ese
# proyecto por la API y no tener identidad de usuario. La CLI entonces dice
# "User not found" o "Could not retrieve Project Settings", que no se parecen en
# nada a "el token tiene el alcance equivocado".
#
# Esta comprobacion es la que separa esos dos casos.

estado_usuario=$(consultar "https://api.vercel.com/v2/user")

if [ "${estado_usuario}" != "200" ]; then
  echo ""
  echo "::error title=El token de Vercel tiene el alcance equivocado::El token puede leer el proyecto \"${nombre}\", pero no tiene identidad de cuenta (/v2/user respondio ${estado_usuario}: $(detalle)). Eso pasa cuando el token se crea con alcance de UN PROYECTO en vez de la CUENTA, y la CLI no puede trabajar asi: falla con 'User not found' o 'Could not retrieve Project Settings'. Crea otro en https://vercel.com/account/tokens eligiendo en Scope la CUENTA (jcyanez), NO el proyecto cancha-total-f5, y volve a cargarlo: gh secret set VERCEL_TOKEN --repo jcyanez/cancha-total-f5"
  exit 1
fi

usuario=$(jq -r '.user.username // .user.email // "?"' "${CUERPO}")
echo "El token tiene alcance de cuenta. Usuario: ${usuario}"
echo ""
echo "Las tres credenciales de Vercel sirven."
exit 0
