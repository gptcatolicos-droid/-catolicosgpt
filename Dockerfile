# Producción: imagen mínima y reproducible para Render, Railway, Cloud Run,
# Fly.io u otro servicio compatible con contenedores.
FROM node:22-alpine AS production

WORKDIR /app
ENV NODE_ENV=production

# Instala exactamente el árbol bloqueado antes de copiar el resto del código.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY . .

# El proveedor suele inyectar PORT; 3000 es el valor seguro por defecto.
ENV PORT=3000
EXPOSE 3000

CMD ["npm", "start"]
