"""Reset the demo database to a clean, freshly-seeded state.

DEVELOPMENT / DEMO USE ONLY — deletes all SolarMesh tables and reseeds.

Usage:  python -m scripts.reset_demo
"""
from __future__ import annotations

from app.db import Base, SessionLocal, engine, run_lightweight_migrations

CONFIRM_WORDS = {"y", "yes"}


def main() -> None:
    print("=" * 60)
    print("  SolarMesh DEMO RESET — this deletes ALL application data")
    print("=" * 60)
    answer = input("Type 'reset' to confirm: ").strip().lower()
    if answer != "reset":
        print("Aborted — database left untouched.")
        return

    print("Dropping all tables...")
    Base.metadata.drop_all(bind=engine)
    print("Recreating schema + seed data...")
    run_lightweight_migrations()

    # Reuse the idempotent seeder against the empty database.
    from scripts import seed

    seed.main()
    print("Demo reset complete. Demo accounts (password: password123):")
    print("  alice@demo.io (prosumer) | bob@demo.io (prosumer)")
    print("  carol@demo.io (consumer) | admin@demo.io (admin)")


if __name__ == "__main__":
    main()
