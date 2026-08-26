#!/usr/bin/env bash
# Comprueba las tres credenciales de Vercel contra la API, antes de intentar
# desplegar. Escrito una sola vez y usado por los dos workflows de despliegue.
#
# Existe porque los errores de la CLI no nombran al culpable. Con un token
# vencido, un ORG_ID de otra cuenta o un PROJECT_ID mal copiado, `vercel pull`
# dice cosas como "User not found" o "Project not found" tres pasos despues de
# la causa, y quien lo lee no sabe cual de los cinco secretos revisar.
#
# Dos llamadas alcanzan para distinguir los casos:
#
#   /v2/user                          -> ¿sirve el token, por si solo?
#   /v9/projects/<pid>?teamId=<oid>    -> ¿la terna completa da con el proyecto?
#
#   user 200 + proyecto 200  ->  las tres bien
#   user != 200              ->  el token
#   user 200 + proyecto 404  ->  el PROJECT_ID o el ORG_ID
#   user 200 + proyecto 403  ->  el token no alcanza a esa cuenta
#
# No imprime ningun valor: solo codigos de estado y el campo error.code de la
# respuesta.

set -uo pipefail

falta() {
  echo "::error title=Falta un secreto::$1 esta vacio. Cargalo en GitHub -> Settings -> Secrets and variables -> Actions."
  exit 1
}

[ -n "${VERCEL_TOKEN:-}" ]      || falta VERCEL_TOKEN
[ -n "${VERCEL_ORG_ID:-}" ]     || falta VERCEL_ORG_ID
[ -n "${VERCEL_PROJECT_ID:-}" ] || falta VERCEL_PROJECT_ID

codigo_de_error() {
  jq -r '.error.code // .error.message // "sin detalle"' "$1" 2>/dev/null || echo "respuesta ilegible"
}

# --- 1. El token, por si solo ----------------------------------------------

estado=$(curl -sS -o cuerpo.json -w '%{http_code}' \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  https://api.vercel.com/v2/user)

if [ "${estado}" != "200" ]; then
  echo "::error title=VERCEL_TOKEN no sirve::La API de Vercel respondio ${estado} a /v2/user ($(codigo_de_error cuerpo.json)). El token no existe, esta vencido, o fue borrado. Crea uno nuevo en https://vercel.com/account/tokens -- con Scope apuntando a tu cuenta y sin expiracion -- y volve a cargar el secreto."
  rm -f cuerpo.json
  exit 1
fi

usuario=$(jq -r '.user.username // .user.email // "?"' cuerpo.json)
echo "1. VERCEL_TOKEN: valido. Cuenta: ${usuario}"

# --- 2. La terna completa contra el proyecto -------------------------------

estado=$(curl -sS -o cuerpo.json -w '%{http_code}' \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}?teamId=${VERCEL_ORG_ID}")

case "${estado}" in
  200)
    nombre=$(jq -r '.name // "?"' cuerpo.json)
    echo "2. VERCEL_ORG_ID + VERCEL_PROJECT_ID: dan con el proyecto \"${nombre}\"."
    echo ""
    echo "Las tres credenciales de Vercel sirven. Se puede desplegar."
    ;;
  404)
    echo "::error title=VERCEL_PROJECT_ID o VERCEL_ORG_ID mal::El token sirve (cuenta ${usuario}) pero con ese par no hay proyecto ($(codigo_de_error cuerpo.json)). Revisa los dos: el PROJECT_ID esta en Project Settings -> General -> Project ID y empieza con prj_. El ORG_ID es el Team ID de la cuenta: clic en el nombre de la cuenta arriba a la izquierda -> Settings -> General -> Team ID, y empieza con team_."
    rm -f cuerpo.json
    exit 1
    ;;
  403)
    echo "::error title=El token no alcanza a esa cuenta::El token sirve (cuenta ${usuario}) pero no tiene permiso sobre el ORG_ID indicado ($(codigo_de_error cuerpo.json)). Al crear el token, el Scope tiene que ser la cuenta donde vive el proyecto."
    rm -f cuerpo.json
    exit 1
    ;;
  *)
    echo "::error title=La API de Vercel respondio ${estado}::$(codigo_de_error cuerpo.json)"
    rm -f cuerpo.json
    exit 1
    ;;
esac

rm -f cuerpo.json
