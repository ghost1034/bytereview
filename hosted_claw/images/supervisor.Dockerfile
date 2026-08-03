# syntax=docker/dockerfile:1.7
# The trusted supervisor image is separate from every tenant runtime.
ARG PYTHON_BASE_IMAGE
FROM ${PYTHON_BASE_IMAGE}

ARG REUSE_SUPERVISOR_BASE=false
RUN if [ "$REUSE_SUPERVISOR_BASE" != true ]; then \
      apt-get update \
      && apt-get install -y --no-install-recommends clamav-daemon clamdscan docker.io xfsprogs \
      && rm -rf /var/lib/apt/lists/*; \
    fi
WORKDIR /opt/hosted-claw
COPY hosted_claw/requirements.txt ./requirements.txt
RUN if [ "$REUSE_SUPERVISOR_BASE" != true ]; then \
      pip install --no-cache-dir -r requirements.txt; \
    fi
COPY hosted_claw/ ./hosted_claw/
ENV PYTHONPATH=/opt/hosted-claw PYTHONUNBUFFERED=1
CMD ["python", "-m", "hosted_claw.supervisor"]
