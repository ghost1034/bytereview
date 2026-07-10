"""One-time provisioning of the e-sign sealing certificate.

Builds a self-signed X.509 certificate for the Cloud KMS asymmetric signing
key (EC_SIGN_P256_SHA256). The private key never leaves KMS: the certificate's
TBS bytes are hashed locally and signed via KMS asymmetric_sign, and the
public key is fetched from KMS.

Prerequisites (run once):
  gcloud kms keyrings create esign --location=us-central1
  gcloud kms keys create esign-seal --location=us-central1 --keyring=esign \
      --purpose=asymmetric-signing --default-algorithm=ec-sign-p256-sha256
  # grant roles/cloudkms.signerVerifier + roles/cloudkms.publicKeyViewer to the
  # runner SA (cpaautomation-runner@<project>.iam.gserviceaccount.com)

Usage:
  python scripts/setup_esign_signing_cert.py \
      --key-version projects/<p>/locations/us-central1/keyRings/esign/cryptoKeys/esign-seal/cryptoKeyVersions/1 \
      --common-name "CPAAutomation E-Signature Seal" \
      --org "CPAAutomation" \
      --years 10 \
      --out esign-seal-cert.pem

Then store the PEM in Secret Manager and expose it to the backend + task-io
services as the ESIGN_SIGNING_CERT_PEM env var, and set
ESIGN_KMS_SIGNING_KEY_VERSION to the pinned key *version* resource name:

  gcloud secrets create esign-signing-cert --data-file=esign-seal-cert.pem

Sign with a pinned key version so envelopes sealed in the past always verify
against the exact key that sealed them; rotating means creating a new key
version + new cert and updating both env vars.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Allow running from the backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from asn1crypto import algos, keys as asn1_keys, pem as asn1_pem, x509 as asn1_x509
from asn1crypto.core import Integer as Asn1Integer


def _load_kms_public_key(kms_client, key_version: str) -> asn1_keys.PublicKeyInfo:
    response = kms_client.get_public_key(request={"name": key_version})
    pem_bytes = response.pem.encode("utf-8")
    _, _, der = asn1_pem.unarmor(pem_bytes)
    return asn1_keys.PublicKeyInfo.load(der)


def _kms_sign_sha256(kms_client, key_version: str, data: bytes) -> bytes:
    digest = hashlib.sha256(data).digest()
    response = kms_client.asymmetric_sign(
        request={"name": key_version, "digest": {"sha256": digest}}
    )
    return response.signature


def build_self_signed_cert(kms_client, key_version: str, common_name: str, org: str, years: int) -> bytes:
    import secrets

    public_key = _load_kms_public_key(kms_client, key_version)
    # X.509 GeneralizedTime must not include fractional seconds.
    now = datetime.now(timezone.utc).replace(microsecond=0)

    name = asn1_x509.Name.build({"common_name": common_name, "organization_name": org})
    signature_algo = algos.SignedDigestAlgorithm({"algorithm": "sha256_ecdsa"})

    tbs = asn1_x509.TbsCertificate(
        {
            "version": "v3",
            "serial_number": secrets.randbits(64),
            "signature": signature_algo,
            "issuer": name,
            "validity": {
                "not_before": asn1_x509.Time({"utc_time": now - timedelta(days=1)}),
                "not_after": asn1_x509.Time({"general_time": now + timedelta(days=365 * years)}),
            },
            "subject": name,
            "subject_public_key_info": public_key,
            "extensions": [
                {
                    "extn_id": "key_usage",
                    "critical": True,
                    "extn_value": asn1_x509.KeyUsage({"digital_signature", "non_repudiation"}),
                },
                {
                    "extn_id": "basic_constraints",
                    "critical": True,
                    "extn_value": asn1_x509.BasicConstraints({"ca": False}),
                },
            ],
        }
    )

    signature = _kms_sign_sha256(kms_client, key_version, tbs.dump())
    certificate = asn1_x509.Certificate(
        {
            "tbs_certificate": tbs,
            "signature_algorithm": signature_algo,
            "signature_value": signature,
        }
    )
    return asn1_pem.armor("CERTIFICATE", certificate.dump())


def main() -> None:
    parser = argparse.ArgumentParser(description="Provision the e-sign KMS sealing certificate")
    parser.add_argument("--key-version", required=True, help="Full KMS cryptoKeyVersion resource name")
    parser.add_argument("--common-name", default="CPAAutomation E-Signature Seal")
    parser.add_argument("--org", default="CPAAutomation")
    parser.add_argument("--years", type=int, default=10)
    parser.add_argument("--out", default="esign-seal-cert.pem")
    args = parser.parse_args()

    from google.cloud import kms

    kms_client = kms.KeyManagementServiceClient()
    cert_pem = build_self_signed_cert(
        kms_client, args.key_version, args.common_name, args.org, args.years
    )
    Path(args.out).write_bytes(cert_pem)
    print(f"Wrote {args.out}")
    print()
    print("Next steps:")
    print(f"  gcloud secrets create esign-signing-cert --data-file={args.out}")
    print("  # expose to backend + task-io as env var ESIGN_SIGNING_CERT_PEM")
    print(f"  # set ESIGN_KMS_SIGNING_KEY_VERSION={args.key_version}")

    # Sanity check: verify the self-signature locally.
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import hashes
    from cryptography.x509 import load_pem_x509_certificate

    cert = load_pem_x509_certificate(cert_pem)
    cert.public_key().verify(cert.signature, cert.tbs_certificate_bytes, ec.ECDSA(hashes.SHA256()))
    print("Self-signature verified OK")


if __name__ == "__main__":
    main()
