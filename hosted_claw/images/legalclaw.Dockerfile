# syntax=docker/dockerfile:1.7
ARG HERMES_BASE_IMAGE
FROM ${HERMES_BASE_IMAGE}
USER root
COPY hermes/legalclaw/profile/SOUL.md hermes/legalclaw/profile/config.yaml /opt/cpaa/profile/
COPY hermes/legalclaw/profile/skills/ /opt/cpaa/profile/skills/
COPY hosted_claw/plugin/ /opt/cpaa/plugin/
COPY hosted_claw/images/hosted-entrypoint /usr/local/bin/hosted-claw-entrypoint
RUN uv pip install --python /opt/hermes/.venv/bin/python --no-cache-dir \
      "openpyxl==3.1.5" "python-dateutil==2.9.0.post0" \
      "python-docx==1.2.0" "PyYAML==6.0.2" \
 && chmod 0755 /usr/local/bin/hosted-claw-entrypoint \
 && chown -R 65532:65532 /opt/cpaa
ENV HERMES_HOME=/opt/data HERMES_DATA_DIR=/opt/data API_SERVER_ENABLED=true API_SERVER_HOST=0.0.0.0 \
    HOSTED_APPROVAL_URL=http://tenant-proxy:8080/api/hosted-claw/runtime/approval
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/hosted-claw-entrypoint"]
CMD ["gateway"]
