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

    # Postgres
    POSTGRES_HOST: str = "localhost"
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
        return (
            f"postgresql+psycopg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_HOST}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
