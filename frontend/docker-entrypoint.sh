#!/bin/sh
set -e
# Replace BACKEND_URL placeholder in nginx config with actual env var
BACKEND_URL=${BACKEND_URL:-http://localhost:8000}
echo "BACKEND_URL=$BACKEND_URL"

# Inject runtime config directly into index.html (replace placeholder)
sed -i "s|__BACKEND_URL__|${BACKEND_URL}|g" /usr/share/nginx/html/index.html
echo "Injected BACKEND_URL into index.html"

envsubst '$BACKEND_URL' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
echo "Generated nginx config:"
cat /etc/nginx/conf.d/default.conf
echo "Testing nginx config..."
nginx -t
echo "Starting nginx..."
exec nginx -g 'daemon off;'
