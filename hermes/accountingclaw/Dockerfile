# syntax=docker/dockerfile:1.7

FROM debian:bookworm-slim AS bundle

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tar \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /bundle
COPY profile/ ./profile/

RUN --mount=type=secret,id=cpaa_bundle_secret,required=true \
    set -eu; \
    tar -C profile -czf /tmp/accountingclaw-profile.tar.gz .; \
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
      -in /tmp/accountingclaw-profile.tar.gz \
      -out /tmp/accountingclaw-profile.tar.gz.enc \
      -pass file:/run/secrets/cpaa_bundle_secret; \
    cd /tmp; \
    sha256sum accountingclaw-profile.tar.gz.enc > accountingclaw-profile.tar.gz.enc.sha256; \
    rm -f /tmp/accountingclaw-profile.tar.gz

FROM nousresearch/hermes-agent:latest

USER root

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tar \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /opt/cpaa /opt/data

COPY --from=bundle /tmp/accountingclaw-profile.tar.gz.enc /opt/cpaa/accountingclaw-profile.tar.gz.enc
COPY --from=bundle /tmp/accountingclaw-profile.tar.gz.enc.sha256 /opt/cpaa/accountingclaw-profile.tar.gz.enc.sha256
COPY bin/accountingclaw-entrypoint /usr/local/bin/accountingclaw-entrypoint

RUN chmod +x /usr/local/bin/accountingclaw-entrypoint

ENV HERMES_DATA_DIR=/opt/data \
    ACCOUNTINGCLAW_BUNDLE=/opt/cpaa/accountingclaw-profile.tar.gz.enc

ENTRYPOINT ["/usr/local/bin/accountingclaw-entrypoint"]
CMD ["gateway", "run"]
