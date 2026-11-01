from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    app_name: str = "SHEWIUN Business Authority"
    environment: str = "development"
    database_url: str = "sqlite:///./shewiun-demo.db"
    demo_seed_enabled: bool = False
    approval_secret: str = "development-only-change-me"
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

settings = Settings()
