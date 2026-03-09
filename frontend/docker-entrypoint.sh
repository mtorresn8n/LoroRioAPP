#!/bin/sh
set -e
# Replace BACKEND_URL placeholder in nginx config with actual env var
BACKEND_URL=${BACKEND_URL:-http://localhost:8000}
echo "BACKEND_URL=$BACKEND_URL"

# Generate runtime config file so the SPA can reach the backend
echo "window.__LORO_CONFIG__={API_URL:\"${BACKEND_URL}\"};" > /usr/share/nginx/html/config.js
echo "Generated config.js:"
cat /usr/share/nginx/html/config.js

envsubst '$BACKEND_URL' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
echo "Generated nginx config:"
cat /etc/nginx/conf.d/default.conf
echo "Testing nginx config..."
nginx -t
echo "Starting nginx..."
exec nginx -g 'daemon off;'
