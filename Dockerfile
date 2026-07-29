# 1. Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies based on package-lock.json
COPY package*.json ./
RUN npm ci

# Copy the rest of the application source code and compile static assets
COPY . .
RUN npm run build

# 2. Production Stage (Ultra-lightweight Web Server)
FROM nginx:alpine

# Create a subdirectory matching the basePath to resolve Next.js asset routing correctly
RUN mkdir -p /usr/share/nginx/html/ai_cost_simulator

# Copy the static HTML output folder 'out' from the builder stage
COPY --from=builder /app/out /usr/share/nginx/html/ai_cost_simulator

# Add a lightweight index redirect at the Nginx root (/) pointing to (/ai_cost_simulator/)
RUN echo '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/ai_cost_simulator/" /></head><body>Redirecting to <a href="/ai_cost_simulator/">/ai_cost_simulator/</a></body></html>' > /usr/share/nginx/html/index.html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
