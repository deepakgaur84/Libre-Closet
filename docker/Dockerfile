# Build stage
FROM node:22 AS builder

# Create app directory
WORKDIR /app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
#
# Note when using COPY with more than one source file, 
# the destination must be a directory and end with a /
COPY package*.json ./
COPY patches ./patches
# The 285 MB background-removal model package is hosted on a CDN that often
# drops the connection from CI machines. If it was pre-downloaded into ./vendor
# (the GitHub workflow does this with a resumable download), seed npm's cache
# with it so `npm ci` never has to fetch it. The bind mount keeps the file out
# of the image layers. Without the file, npm simply downloads it as usual.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=vendor,target=/vendor \
    npm config set fetch-retries 6 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 180000 \
    && if [ -f /vendor/imgly-data.tgz ]; then npm cache add /vendor/imgly-data.tgz; fi \
    && npm ci

COPY src ./src
COPY views ./views
COPY public ./public
COPY tsconfig*.json ./
COPY nest-cli.json .
COPY tailwind.config.js .
COPY workbox-config.js .

RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

COPY package*.json ./
COPY patches ./patches
# The 285 MB background-removal model package is hosted on a CDN that often
# drops the connection from CI machines. If it was pre-downloaded into ./vendor
# (the GitHub workflow does this with a resumable download), seed npm's cache
# with it so `npm ci` never has to fetch it. The bind mount keeps the file out
# of the image layers. Without the file, npm simply downloads it as usual.
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=bind,source=vendor,target=/vendor \
    npm config set fetch-retries 6 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 180000 \
    && if [ -f /vendor/imgly-data.tgz ]; then npm cache add /vendor/imgly-data.tgz; fi \
    && npm ci

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/views ./views
COPY --from=builder /app/public ./public

COPY .env .

# Set NODE_ENV to production
ENV NODE_ENV=production

EXPOSE 3000

CMD [ "npm", "run", "start:prod" ]
