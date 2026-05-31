"""One-off: promote a user to admin for local testing."""
import os
import sys

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv()

EMAIL = "starstream521@gmail.com"
USER_ID = "dev-local-user"


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        print("DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)

    engine = create_engine(database_url)
    with engine.begin() as conn:
        before = conn.execute(
            text(
                "SELECT id, email, role, firm_id FROM users "
                "WHERE email = :email OR id = :user_id"
            ),
            {"email": EMAIL, "user_id": USER_ID},
        ).fetchall()
        print("Before:")
        for row in before:
            print(f"  id={row.id} email={row.email} role={row.role} firm_id={row.firm_id}")

        result = conn.execute(
            text(
                "UPDATE users SET role = 'admin', updated_at = NOW() "
                "WHERE email = :email OR id = :user_id "
                "RETURNING id, email, role, firm_id"
            ),
            {"email": EMAIL, "user_id": USER_ID},
        ).fetchall()

        print("\nAfter:")
        for row in result:
            print(f"  id={row.id} email={row.email} role={row.role} firm_id={row.firm_id}")

        if not result:
            print("No matching user row found.", file=sys.stderr)
            sys.exit(1)


if __name__ == "__main__":
    main()
