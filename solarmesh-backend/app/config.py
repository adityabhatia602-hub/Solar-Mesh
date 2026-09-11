"""Application configuration loaded from environment / .env."""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Security
    SECRET_KEY: str = "dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Database
    # Defaults to SQLite for zero-dependency local dev (no Docker required).
    # Can be set to PostgreSQL (e.g. Neon, Supabase, Render) via DATABASE_URL or POSTGRES_HOST.
    DATABASE_URL: str | None = None
    POSTGRES_HOST: str | None = None
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "solarmesh"
    POSTGRES_PASSWORD: str = "solarmesh_dev_pw"
    POSTGRES_DB: str = "solarmesh"

    # Matching engine
    MATCH_INTERVAL_SECONDS: int = 5
    MAX_ORDER_AGE_HOURS: int = 48
    ENERGY_PRICE_FLOOR: float = 0.05
    ENERGY_PRICE_CEIL: float = 0.50

    # Grid
    GRID_LOSS_FACTOR: float = 0.02
    CONGESTION_PENALTY: float = 0.15

    @property
    def database_url(self) -> str:
        if self.DATABASE_URL:
            url = self.DATABASE_URL
            if url.startswith("postgres://"):
                url = url.replace("postgres://", "postgresql+psycopg://", 1)
            elif url.startswith("postgresql://") and "+psycopg" not in url:
                url = url.replace("postgresql://", "postgresql+psycopg://", 1)
            return url
        if self.POSTGRES_HOST:
            return (
                f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return "sqlite:///./solarmesh.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
