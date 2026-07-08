# syntax=docker/dockerfile:1.7

FROM debian:bookworm-slim AS bundle

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tar \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /bundle
COPY profile/ ./profile/

RUN --mount=type=secret,id=cpaa_bundle_secret,required=true \
    set -eu; \
    tar -C profile -czf /tmp/legalclaw-profile.tar.gz .; \
    openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
      -in /tmp/legalclaw-profile.tar.gz \
      -out /tmp/legalclaw-profile.tar.gz.enc \
      -pass file:/run/secrets/cpaa_bundle_secret; \
    cd /tmp; \
    sha256sum legalclaw-profile.tar.gz.enc > legalclaw-profile.tar.gz.enc.sha256; \
    rm -f /tmp/legalclaw-profile.tar.gz

FROM nousresearch/hermes-agent:latest

USER root

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates openssl tar curl jq \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /opt/cpaa /opt/data

# Runtime dependencies for producing LegalClaw deliverables (python-docx memos
# and markups, openpyxl issue trackers, YAML/date parsing). Installed into the
# Hermes venv; python/python3 are pointed at that venv so skill-driven
# `python ...` invocations resolve these packages.
#
# The Hermes base image manages its venv with `uv` (no `pip`/`ensurepip` is
# present inside /opt/hermes/.venv), so we install with `uv pip install`
# targeting that interpreter explicitly rather than `python -m pip`.
RUN uv pip install --python /opt/hermes/.venv/bin/python --no-cache-dir \
      "openpyxl>=3.1" \
      "python-dateutil>=2.8" \
      "python-docx>=1.1" \
      "PyYAML>=6.0" \
 && ln -sf /opt/hermes/.venv/bin/python /usr/local/bin/python \
 && ln -sf /opt/hermes/.venv/bin/python /usr/local/bin/python3

COPY --from=bundle /tmp/legalclaw-profile.tar.gz.enc /opt/cpaa/legalclaw-profile.tar.gz.enc
COPY --from=bundle /tmp/legalclaw-profile.tar.gz.enc.sha256 /opt/cpaa/legalclaw-profile.tar.gz.enc.sha256
COPY bin/legalclaw-entrypoint /usr/local/bin/legalclaw-entrypoint

RUN chmod +x /usr/local/bin/legalclaw-entrypoint \
 && ln -sf /opt/hermes/.venv/bin/hermes /usr/local/bin/hermes

ENV HERMES_DATA_DIR=/opt/data \
    LEGALCLAW_BUNDLE=/opt/cpaa/legalclaw-profile.tar.gz.enc \
    CPAA_ACTIVATION_URL=https://api.cpaautomation.ai/api/activation/resolve

ENTRYPOINT ["/usr/local/bin/legalclaw-entrypoint"]
CMD ["gateway", "run"]
