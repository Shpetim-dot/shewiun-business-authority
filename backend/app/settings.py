from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "SHEWIUN Business Authority"
    environment: str = "development"
    database_url: str = "sqlite:///./shewiun-demo.db"
    demo_seed_enabled: bool = False
    api_shared_secret: str = ""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def storage_mode(self) -> str:
        return "postgresql" if self.database_url.startswith(("postgresql://", "postgresql+")) else "sqlite-demo"

settings = Settings()
