# Build with workspace root as Docker context:
# docker build -f Samsar-Atlas/Dockerfile -t samsar-atlas .

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY samsar-js/package*.json ./samsar-js/
RUN cd samsar-js && npm ci
COPY samsar-js ./samsar-js
RUN cd samsar-js && npm run build

COPY Samsar-Atlas/package*.json ./Samsar-Atlas/
RUN cd Samsar-Atlas && npm ci
COPY Samsar-Atlas ./Samsar-Atlas
RUN cd Samsar-Atlas && npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/samsar-js ./samsar-js
COPY --from=build /app/Samsar-Atlas/package*.json ./Samsar-Atlas/
COPY --from=build /app/Samsar-Atlas/node_modules ./Samsar-Atlas/node_modules
COPY --from=build /app/Samsar-Atlas/dist ./Samsar-Atlas/dist

WORKDIR /app/Samsar-Atlas
EXPOSE 8080

CMD ["node", "dist/server.js"]
