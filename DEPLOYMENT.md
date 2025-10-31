# For development with hot reload
npm run dev

# For production on your VPS
git clone https://your-repo-url/trash-to-treasure.git
cd trash-to-treasure
chmod +x deploy.sh
sudo ./deploy.sh

# View logs
docker-compose logs -f

# Update the app
git pull
docker-compose up -d --build

# Stop everything
docker-compose down