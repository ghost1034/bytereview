from __future__ import annotations

import json

from taxatlas.core.db import SessionLocal
from taxatlas.seed.runner import run_seed


def main() -> None:
    with SessionLocal() as db:
        print(json.dumps(run_seed(db), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()

