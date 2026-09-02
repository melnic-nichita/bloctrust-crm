FROM node:24-bookworm-slim AS build

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json prisma.config.ts ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile --filter . --filter @bloctrust/api...

COPY prisma prisma
COPY apps/api/src apps/api/src
COPY apps/api/nest-cli.json apps/api/nest-cli.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json

RUN pnpm db:generate \
  && pnpm --filter @bloctrust/api build

FROM build AS migration

CMD ["pnpm", "db:deploy"]

FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV API_PORT=3001

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist

USER node
EXPOSE 3001

CMD ["node", "apps/api/dist/main.js"]
