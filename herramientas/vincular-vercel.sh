#!/usr/bin/env bash
# Vincula el directorio con el proyecto de Vercel, que es lo que `vercel pull`
# y `vercel build` necesitan antes de poder hacer nada.
#
# Es mas largo que un solo comando por una razon: "Could not retrieve Project
# Settings" es el unico error que da la CLI para varias causas distintas -el
# proyecto no existe, el scope no corresponde, el flag recibio un id donde
# esperaba un nombre- y no dice cual. Este script prueba las formas validas en
# orden, informa cual funciono, y si ninguna funciona muestra la traza de cada
# intento con los valores largos tapados.
#
# El nombre del proyecto no se escribe a mano: se le pregunta a la API por el
# PROJECT_ID. Asi el script sirve igual si el proyecto se renombra.
#
# Ninguna salida deja ver un secreto: todo pasa por un sed que tapa cualquier
# cadena de 24 caracteres o mas, que es lo que mide un token.

set -uo pipefail

tapar() {
  sed -E 's/[A-Za-z0-9_.-]{24,}/***/g'
}

# --- El nombre del proyecto, desde la API ----------------------------------

respuesta=$(curl -sS \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}")

NOMBRE=$(printf '%s' "${respuesta}" | jq -r '.name // empty')

if [ -z "${NOMBRE}" ]; then
  echo "::error title=No se pudo leer el nombre del proyecto::La API no devolvio un nombre para ese PROJECT_ID. $(printf '%s' "${respuesta}" | tapar | cut -c1-200)"
  exit 1
fi

echo "Proyecto a vincular: \"${NOMBRE}\""
echo ""

# --- Los intentos ----------------------------------------------------------

trazas=""

intentar() {
  local descripcion="$1"
  shift

  echo "Intento: ${descripcion}"
  rm -rf .vercel

  if "$@" > salida.txt 2>&1; then
    echo "  -> funciono."
    rm -f salida.txt
    return 0
  fi

  local traza
  traza=$(tapar < salida.txt | tail -12)
  trazas="${trazas}
--- ${descripcion}
${traza}"
  echo "  -> fallo."
  rm -f salida.txt
  return 1
}

# 1. Con el nombre del proyecto, que es lo que documenta el flag --project.
#    El intento anterior le pasaba el PROJECT_ID, y la CLI buscaba un proyecto
#    llamado literalmente "prj_...".
if intentar "vercel link --project <nombre>" \
    vercel link --yes --project "${NOMBRE}"; then
  echo ""
  echo "Vinculado."
  exit 0
fi

# 2. Igual, pero sin VERCEL_ORG_ID en el entorno. Esta cuenta es personal y no
#    tiene equipos -comprobado: /v2/teams no devuelve ninguno-, asi que la CLI
#    puede estar pidiendo un teamId que no existe.
if intentar "vercel link --project <nombre>, sin VERCEL_ORG_ID" \
    env -u VERCEL_ORG_ID vercel link --yes --project "${NOMBRE}"; then
  echo ""
  echo "Vinculado (sin scope de equipo: la cuenta es personal)."
  exit 0
fi

# 3. Sin link explicito: dejar que el pull se vincule solo con las variables de
#    entorno, que es lo que documenta Vercel para CI.
if intentar "vercel pull, vinculando por variables de entorno" \
    vercel pull --yes --environment=preview; then
  echo ""
  echo "Vinculado por el propio pull."
  exit 0
fi

# --- Ninguna funciono ------------------------------------------------------

echo ""
echo "Ninguna forma de vincular funciono. Trazas de cada intento:"
echo "${trazas}"
echo ""
echo "::error title=No se pudo vincular el proyecto de Vercel::Las tres formas fallaron. Las trazas estan arriba, en el log de este paso. Las credenciales ya fueron verificadas contra la API en el paso anterior, asi que el problema no son los secretos."
exit 1
