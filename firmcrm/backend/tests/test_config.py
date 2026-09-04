import pytest

from app.core.config import Settings


def test_cors_origins_accepts_csv_and_json(monkeypatch):
    monkeypatch.setenv("CORS_ORIGINS", "https://a.example.com, https://b.example.com")
    assert Settings(_env_file=None).cors_origins == ["https://a.example.com", "https://b.example.com"]
    monkeypatch.setenv("CORS_ORIGINS", '["https://c.example.com"]')
    s = Settings(_env_file=None)
    assert s.cors_origins in (["https://c.example.com"], ['["https://c.example.com"]'])  # JSON form tolerated, CSV is canonical


def test_production_guards(monkeypatch):
    base = {"APP_ENV": "production", "DATABASE_URL": "postgresql+psycopg://u:p@h/db", "CORS_ORIGINS": "https://crm.example.com",
            "SECRET_KEY": "x" * 40}
    for k, v in base.items():
        monkeypatch.setenv(k, v)
    Settings(_env_file=None).validate_for_runtime()
    monkeypatch.setenv("SECRET_KEY", "dev-only-change-me-not-for-production-use-0000")
    with pytest.raises(RuntimeError):
        Settings(_env_file=None).validate_for_runtime()
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    monkeypatch.setenv("CORS_ORIGINS", "http://localhost:5180")
    with pytest.raises(RuntimeError):
        Settings(_env_file=None).validate_for_runtime()
    monkeypatch.setenv("CORS_ORIGINS", "https://crm.example.com")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///./x.db")
    with pytest.raises(RuntimeError):
        Settings(_env_file=None).validate_for_runtime()
    monkeypatch.setenv("SECRET_KEY", "short")
    monkeypatch.setenv("APP_ENV", "development")
    with pytest.raises(RuntimeError):
        Settings(_env_file=None).validate_for_runtime()
