"""pyHanko Signer implementations for the e-sign PAdES tamper seal.

Production: KMSSigner signs with a Cloud KMS asymmetric key (EC_SIGN_P256_SHA256)
— the private key never leaves KMS; we hash locally and send only the digest.
The matching self-signed X.509 certificate is provisioned once by
scripts/setup_esign_signing_cert.py and injected as ESIGN_SIGNING_CERT_PEM
(Secret Manager -> Cloud Run env var).

Development/tests: LocalEcSigner signs with a PEM EC private key from
ESIGN_LOCAL_SIGNING_KEY_PEM so the pipeline runs without GCP.

Pin note: written against pyhanko 0.35.x — the external-Signer interface
(async_sign_raw) is stable but constructor kwargs are version-sensitive.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
from typing import Optional

from asn1crypto import pem as asn1_pem, x509 as asn1_x509
from asn1crypto.algos import SignedDigestAlgorithm
from pyhanko.sign.signers.pdf_cms import Signer
from pyhanko_certvalidator.registry import SimpleCertificateStore

logger = logging.getLogger(__name__)

# ECDSA P-256 signatures are DER-encoded, at most ~72 bytes; reserve headroom.
_DRY_RUN_SIGNATURE_SIZE = 96


def load_cert_from_pem_bytes(pem_bytes: bytes) -> asn1_x509.Certificate:
    data = pem_bytes
    if asn1_pem.detect(data):
        _, _, data = asn1_pem.unarmor(data)
    return asn1_x509.Certificate.load(data)


def load_signing_cert() -> Optional[asn1_x509.Certificate]:
    """Load the org sealing certificate from env (Secret Manager-injected)."""
    pem_text = os.getenv("ESIGN_SIGNING_CERT_PEM")
    if not pem_text:
        cert_path = os.getenv("ESIGN_SIGNING_CERT_PATH")
        if cert_path and os.path.exists(cert_path):
            with open(cert_path, "rb") as fh:
                return load_cert_from_pem_bytes(fh.read())
        return None
    return load_cert_from_pem_bytes(pem_text.encode("utf-8"))


class KMSSigner(Signer):
    """pyHanko Signer backed by Cloud KMS asymmetric_sign.

    Signs with a pinned key *version* so envelopes sealed years ago still
    verify against the exact key that sealed them.
    """

    def __init__(self, cert: asn1_x509.Certificate, key_version_name: str):
        registry = SimpleCertificateStore()
        registry.register(cert)
        super().__init__(
            signing_cert=cert,
            cert_registry=registry,
            signature_mechanism=SignedDigestAlgorithm({"algorithm": "sha256_ecdsa"}),
        )
        self.key_version_name = key_version_name
        self._kms_client = None

    @property
    def kms_client(self):
        if self._kms_client is None:
            from google.cloud import kms

            self._kms_client = kms.KeyManagementServiceClient()
        return self._kms_client

    async def async_sign_raw(self, data: bytes, digest_algorithm: str, dry_run: bool = False) -> bytes:
        if dry_run:
            return bytes(_DRY_RUN_SIGNATURE_SIZE)
        if digest_algorithm.lower() != "sha256":
            raise ValueError(f"KMSSigner only supports sha256, got {digest_algorithm}")
        digest = hashlib.sha256(data).digest()

        def _sign() -> bytes:
            response = self.kms_client.asymmetric_sign(
                request={
                    "name": self.key_version_name,
                    "digest": {"sha256": digest},
                }
            )
            return response.signature

        signature = await asyncio.to_thread(_sign)
        logger.info("KMS-signed esign seal digest with %s", self.key_version_name)
        return signature


class LocalEcSigner(Signer):
    """Development-only Signer using a local EC P-256 private key PEM."""

    def __init__(self, cert: asn1_x509.Certificate, private_key_pem: bytes):
        registry = SimpleCertificateStore()
        registry.register(cert)
        super().__init__(
            signing_cert=cert,
            cert_registry=registry,
            signature_mechanism=SignedDigestAlgorithm({"algorithm": "sha256_ecdsa"}),
        )
        from cryptography.hazmat.primitives.serialization import load_pem_private_key

        self._private_key = load_pem_private_key(private_key_pem, password=None)

    async def async_sign_raw(self, data: bytes, digest_algorithm: str, dry_run: bool = False) -> bytes:
        if dry_run:
            return bytes(_DRY_RUN_SIGNATURE_SIZE)
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import Prehashed

        digest = hashlib.new(digest_algorithm, data).digest()
        return self._private_key.sign(digest, ec.ECDSA(Prehashed(hashes.SHA256())))


def build_seal_signer() -> tuple[Signer, dict]:
    """Return (signer, evidence_details) for the sealing pipeline.

    evidence_details is recorded in the 'sealed' audit event so old envelopes
    can always be traced to the key/cert that sealed them.
    """
    cert = load_signing_cert()
    if cert is None:
        raise RuntimeError(
            "No sealing certificate configured (set ESIGN_SIGNING_CERT_PEM; "
            "provision with scripts/setup_esign_signing_cert.py)"
        )
    subject = cert.subject.human_friendly

    key_version = os.getenv("ESIGN_KMS_SIGNING_KEY_VERSION")
    if key_version:
        return KMSSigner(cert, key_version), {
            "seal_backend": "cloud_kms",
            "kms_key_version": key_version,
            "cert_subject": subject,
        }

    local_key_pem = os.getenv("ESIGN_LOCAL_SIGNING_KEY_PEM")
    local_key_path = os.getenv("ESIGN_LOCAL_SIGNING_KEY_PATH")
    if not local_key_pem and local_key_path and os.path.exists(local_key_path):
        with open(local_key_path, "rb") as fh:
            local_key_pem = fh.read().decode("utf-8")
    if local_key_pem:
        if os.getenv("ENVIRONMENT") == "production":
            raise RuntimeError("Local signing keys are not allowed in production; configure KMS")
        return LocalEcSigner(cert, local_key_pem.encode("utf-8")), {
            "seal_backend": "local_dev_key",
            "cert_subject": subject,
        }

    raise RuntimeError(
        "No signing key configured (set ESIGN_KMS_SIGNING_KEY_VERSION or, for dev, "
        "ESIGN_LOCAL_SIGNING_KEY_PEM)"
    )
