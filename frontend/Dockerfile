FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

RUN apk add --no-cache gettext

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# Add placeholder in HTML that entrypoint will replace with real config
RUN sed -i 's|</head>|<script>window.__LORO_CONFIG__={API_URL:"__BACKEND_URL__"};</script></head>|' /usr/share/nginx/html/index.html

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD []
