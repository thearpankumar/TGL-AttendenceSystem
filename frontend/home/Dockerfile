FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY --from=builder /app/.output ./
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "server/index.mjs"]
