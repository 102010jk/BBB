# --- build stage: compile the Vite app -------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# install deps first for better layer caching
COPY package.json package-lock.json ./
RUN npm ci

# build the production bundle (tsc -b && vite build)
COPY . .
RUN npm run build

# --- serve stage: static files via nginx on port 8222 ----------------------
FROM nginx:alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8222
CMD ["nginx", "-g", "daemon off;"]
