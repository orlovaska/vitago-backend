#!/bin/sh
# Renders the virtual hosts from DOMAIN / API_DOMAIN and the certificates
# present, then runs nginx and reloads it daily to pick up renewed certificates.
set -eu

DOMAIN="${DOMAIN:-}"
API_DOMAIN="${API_DOMAIN:-}"
if [ -z "$API_DOMAIN" ]; then
    if [ -n "$DOMAIN" ]; then API_DOMAIN="api.$DOMAIN"; else API_DOMAIN="_"; fi
fi

has_certificate() {
    [ "$1" != "_" ] && [ -f "/etc/letsencrypt/live/$1/fullchain.pem" ]
}

render() {
    # Only our variables are substituted; nginx's own $variables stay intact.
    envsubst '${DOMAIN} ${API_DOMAIN} ${CERT_NAME}' < "/etc/nginx/sites/$1" > "/etc/nginx/conf.d/$2"
}

rm -f /etc/nginx/conf.d/*.conf
export DOMAIN API_DOMAIN CERT_NAME=""

# One certificate often covers both hosts (issued for DOMAIN with api. as a SAN).
if has_certificate "$API_DOMAIN"; then
    CERT_NAME="$API_DOMAIN"
    render api-https.conf api.conf
elif [ -n "$DOMAIN" ] && has_certificate "$DOMAIN"; then
    CERT_NAME="$DOMAIN"
    render api-https.conf api.conf
else
    render api-http.conf api.conf
fi

if [ -n "$DOMAIN" ]; then
    if has_certificate "$DOMAIN"; then
        CERT_NAME="$DOMAIN"
        render site-https.conf site.conf
    else
        render site-http.conf site.conf
    fi
fi

nginx -t
nginx -g 'daemon off;' &
NGINX_PID=$!
trap 'kill -TERM "$NGINX_PID"; wait "$NGINX_PID"' TERM INT

while kill -0 "$NGINX_PID" 2>/dev/null; do
    sleep 86400 &
    wait $! || true
    kill -HUP "$NGINX_PID" 2>/dev/null || true
done
wait "$NGINX_PID"
