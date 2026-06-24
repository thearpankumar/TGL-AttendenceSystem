FROM node:18-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json ./
RUN npm install --only=production

COPY src ./src

EXPOSE 5000

CMD ["node", "src/server.js"]
