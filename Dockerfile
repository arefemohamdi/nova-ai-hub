FROM node:22-alpine
WORKDIR /app
COPY . .
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
