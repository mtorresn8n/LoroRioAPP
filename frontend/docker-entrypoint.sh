#!/bin/sh
# Replace BACKEND_URL placeholder in nginx config with actual env var
BACKEND_URL=${BACKEND_URL:-http://localhost:8000}
envsubst '$BACKEND_URL' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
