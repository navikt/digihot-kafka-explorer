FROM node:lts-trixie-slim AS dependencies

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

FROM gcr.io/distroless/nodejs24-debian13:nonroot

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json ./
COPY src/*.mts ./src/
COPY public/ ./public/
USER 65532:65532
EXPOSE 3000
CMD ["--experimental-strip-types", "src/app.mts"]
