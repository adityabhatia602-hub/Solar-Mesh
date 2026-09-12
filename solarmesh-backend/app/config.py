"""Application configuration loaded from environment / .env."""
from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Security
    SECRET_KEY: str = "dev-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 120
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    GOOGLE_CLIENT_ID: str = ""

    @field_validator("ALGORITHM", "SECRET_KEY", "DATABASE_URL", mode="before")
    @classmethod
    def sanitize_strings(cls, v: str | None) -> str | None:
        if isinstance(v, str):
            return v.strip()
        return v

    # Database
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

    # Digital-twin simulation
    SIMULATION_INTERVAL_SECONDS: float = 4.0

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
        # POSTGRES_HOST values that clearly mean "not configured" fall back to
        # the zero-setup SQLite default so local dev never requires a DB server.
        if self.POSTGRES_HOST and self.POSTGRES_HOST not in ("localhost", "127.0.0.1", ""):
            return (
                f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
                f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
            )
        return "sqlite:///./solarmesh.db"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
