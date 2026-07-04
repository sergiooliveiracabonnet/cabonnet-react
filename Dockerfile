FROM node:20-slim
ENV TZ=America/Sao_Paulo
RUN apt-get update && apt-get install -y python3 python3-pip curl tzdata --no-install-recommends && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY requirements.txt ./
RUN pip3 install -r requirements.txt --break-system-packages
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "servidor.js"]
