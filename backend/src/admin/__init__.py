from pathlib import Path

from sqladmin import Admin

from .auth import MasterKeyAuth
from .views import BlockedTokenAdmin, EmailVerificationCodeAdmin, PasswordResetCodeAdmin, StatsView, UserAdmin

_TEMPLATES_DIR = str(Path(__file__).parent.parent.parent / "templates")


def create_admin(app, engine) -> Admin:
    from src.core.settings import get_settings
    settings = get_settings()

    admin = Admin(
        app=app,
        engine=engine,
        authentication_backend=MasterKeyAuth(
            secret_key=settings.app.secret_key.get_secret_value()
        ),
        title="Работа для всех — Auth Admin",
        base_url="/admin",
        templates_dir=_TEMPLATES_DIR,
    )
    admin.add_view(UserAdmin)
    admin.add_view(EmailVerificationCodeAdmin)
    admin.add_view(PasswordResetCodeAdmin)
    admin.add_view(BlockedTokenAdmin)
    StatsView.engine = engine
    admin.add_base_view(StatsView)
    return admin
