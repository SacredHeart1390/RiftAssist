# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS node_runtime
FROM ubuntu:24.04
RUN --mount=type=secret,id=proxy_ca,required=true \
    printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod 755 /usr/sbin/policy-rc.d && \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update && \
    apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends caddy ca-certificates libstdc++6 && \
    rm -rf /var/lib/apt/lists/*
COPY --from=node_runtime /usr/local/bin/node /usr/local/bin/node
COPY code /code
RUN find /code -type d -exec chmod 755 {} + && find /code -type f -exec chmod 644 {} +
WORKDIR /code/control-center
ENV RIFTASSIST_TEST_CADDY=/usr/bin/caddy
# Runtime must be --network none. All generated records, keys and CA stay inside this disposable container.
CMD ["node", "staging/integration.cjs"]
