from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    DB_DIALECT: str = "sqlite"  # sqlite | mysql
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "carduser"
    DB_PASSWORD: str = "cardpass"
    DB_NAME: str = "cardgame"

    # Redis
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379

    # App
    SECRET_KEY: str = "change-this-in-production"
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def database_url(self) -> str:
        if self.DB_DIALECT == "sqlite":
            return "sqlite+aiosqlite:///./cardgame.db"
        return (
            f"mysql+asyncmy://{self.DB_USER}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.REDIS_HOST}:{self.REDIS_PORT}/0"

    class Config:
        env_file = ".env"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()
