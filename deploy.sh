#!/bin/bash
# Deploy script for trashtotreasure.info.co.za

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo "Please run as root (sudo)"
  exit 1
fi

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
    echo "Installing Docker Compose..."
    curl -L "https://github.com/docker/compose/releases/download/v2.23.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Create directories
mkdir -p certbot/conf certbot/www models data

# Start nginx first (needed for certbot)
docker-compose up -d nginx

# Get SSL certificate
echo "Getting SSL certificate for trashtotreasure.info.co.za..."
docker-compose run --rm certbot certonly --webroot --webroot-path /var/www/certbot \
    --email admin@trashtotreasure.info.co.za --agree-tos --no-eff-email \
    -d trashtotreasure.info.co.za

# Restart everything with SSL
echo "Starting all services..."
docker-compose up -d

echo "Done! The app should be running at https://trashtotreasure.info.co.za"
echo "Check logs with: docker-compose logs -f"