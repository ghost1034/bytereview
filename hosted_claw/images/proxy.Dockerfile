# syntax=docker/dockerfile:1.7
ARG CADDY_BASE_IMAGE
FROM ${CADDY_BASE_IMAGE}
USER root
# The upstream binary carries cap_net_bind_service for privileged ports. The
# hosted proxy listens on 8080 and runs with every capability dropped, so copy
# it without file capabilities to remain compatible with no-new-privileges.
RUN cp /usr/bin/caddy /tmp/caddy-hosted \
 && chown 65532:65532 /tmp/caddy-hosted \
 && chmod 0755 /tmp/caddy-hosted \
 && mv /tmp/caddy-hosted /usr/bin/caddy
USER 65532:65532
