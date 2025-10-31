FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm install --production

# Copy app source
COPY . .

# Create required directories
RUN mkdir -p models data

# Expose the app port
EXPOSE 3000

# Start with Node directly (pm2 not needed in container)
CMD ["node", "server.js"]