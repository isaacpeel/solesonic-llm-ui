#!/bin/sh
# Renders /etc/nginx/default.conf.template to /etc/nginx/conf.d/default.conf,
# filling in the Content-Security-Policy connect-src origins.
#
# The official nginx entrypoint runs every executable file in /docker-entrypoint.d/
# in sort order before starting nginx. This script deliberately produces its result
# by *writing a file* rather than by exporting variables for the stock
# 20-envsubst-on-templates.sh step: the entrypoint runs these scripts inside a
# `find | while read` pipeline, so whether an export escapes that subshell is a
# detail we would rather not depend on. Writing a file works either way.
#
# The template is kept at /etc/nginx/default.conf.template, NOT in
# /etc/nginx/templates/, so the stock envsubst step ignores it and cannot overwrite
# what we render here.
#
# The origins come from the same VITE_* values the Vite build consumed, which
# docker-compose passes in from .env. That keeps .env the single source of truth,
# so the browser's connect-src allowlist cannot drift away from the hosts the app
# actually calls, and no hostname has to be committed to the repository.

set -e

TEMPLATE_PATH=/etc/nginx/default.conf.template
OUTPUT_PATH=/etc/nginx/conf.d/default.conf

# https://host:port/some/path -> https://host:port
# Pure parameter expansion, so it does not depend on the sed flavour in alpine.
origin_of() {
    url="$1"
    scheme="${url%%://*}"
    authority="${url#*://}"
    authority="${authority%%/*}"

    printf '%s://%s' "$scheme" "$authority"
}

require_absolute_url() {
    variable_name="$1"
    variable_value="$2"

    if [ -z "$variable_value" ]; then
        echo "$0: FATAL: $variable_name is empty in the container environment." >&2
        echo "$0:        Set it in .env; docker-compose.yml passes that in via env_file." >&2
        echo "$0:        After editing .env run 'docker-compose up -d --force-recreate'," >&2
        echo "$0:        because a plain restart reuses the old environment." >&2
        exit 1
    fi

    case "$variable_value" in
        http://*|https://*)
            ;;
        *)
            echo "$0: FATAL: $variable_name must be an absolute http(s) URL, got '$variable_value'." >&2
            exit 1
            ;;
    esac
}

require_absolute_url VITE_API_BASE_URI "$VITE_API_BASE_URI"
require_absolute_url VITE_KEYCLOAK_URL "$VITE_KEYCLOAK_URL"

CSP_API_ORIGIN="$(origin_of "$VITE_API_BASE_URI")"
CSP_KEYCLOAK_ORIGIN="$(origin_of "$VITE_KEYCLOAK_URL")"
export CSP_API_ORIGIN
export CSP_KEYCLOAK_ORIGIN

# Naming both variables explicitly means envsubst replaces only these two and
# leaves nginx's own $uri / $host / $content_security_policy alone.
envsubst '${CSP_API_ORIGIN} ${CSP_KEYCLOAK_ORIGIN}' < "$TEMPLATE_PATH" > "$OUTPUT_PATH"

echo "$0: connect-src allows 'self' $CSP_API_ORIGIN $CSP_KEYCLOAK_ORIGIN"
