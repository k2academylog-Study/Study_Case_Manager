from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", ".env.local"), extra="ignore")
    next_public_supabase_url: str = ""
    next_public_supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    database_url: str = ""
    internal_api_secret: str = ""
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    ai_timeout_seconds: int = 45
    ai_input_usd_per_million: float = 0.15
    ai_output_usd_per_million: float = 0.60
    institution_timezone: str = "Asia/Kolkata"
    redis_url: str = ""
    celery_broker_url: str = ""
    celery_result_backend: str = ""
    resend_api_key: str = ""
    email_from: str = ""
    email_webhook_secret: str = ""
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_business_account_id: str = ""
    whatsapp_verify_token: str = ""
    meta_app_secret: str = ""
    whatsapp_graph_api_version: str = ""

    @property
    def model_ready(self) -> bool:
        return bool(self.openai_api_key and self.openai_model == "gpt-4o-mini")

    @property
    def broker(self) -> str:
        return self.celery_broker_url or self.redis_url

    def channel_ready(self, channel: str) -> bool:
        if channel == "email":
            return bool(self.resend_api_key and self.email_from and self.email_webhook_secret)
        if channel == "whatsapp":
            return bool(self.whatsapp_access_token and self.whatsapp_phone_number_id and
                        self.whatsapp_business_account_id and self.whatsapp_verify_token and
                        self.meta_app_secret and self.whatsapp_graph_api_version)
        return False


@lru_cache
def config() -> Settings:
    return Settings()

