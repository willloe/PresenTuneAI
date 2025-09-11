# frontend/Dockerfile

# --- builder ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .

# Accept Vite mode (defaults to production)
ARG VITE_MODE=production
ENV VITE_MODE=${VITE_MODE}

# Build with explicit mode
RUN npm run build -- --mode ${VITE_MODE}

# --- runtime ---
FROM nginx:1.29-alpine
# Copy built site
COPY --from=builder /app/dist /usr/share/nginx/html
COPY ./nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
