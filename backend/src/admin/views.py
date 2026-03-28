from datetime import datetime, timedelta, timezone

from markupsafe import Markup
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqladmin import ModelView
from sqladmin import BaseView, expose
from starlette.requests import Request
from starlette.responses import Response

from src.db.models.blocklist import BlockedToken
from src.db.models.users import EmailVerificationCode, PasswordResetCode, User


def _fmt_bool_verified(model: User, attr: str) -> Markup:
    if model.is_verified:
        return Markup(
            '<span style="background:#22C55E;color:#000;padding:2px 8px;'
            'border-radius:4px;font-size:0.8em;font-weight:600;">подтверждён</span>'
        )
    return Markup(
        '<span style="background:#EF4444;color:#fff;padding:2px 8px;'
        'border-radius:4px;font-size:0.8em;font-weight:600;">не подтверждён</span>'
    )


def _fmt_bool_active(model: User, attr: str) -> Markup:
    if model.is_active:
        return Markup(
            '<span style="background:#22C55E;color:#000;padding:2px 8px;'
            'border-radius:4px;font-size:0.8em;font-weight:600;">активен</span>'
        )
    return Markup(
        '<span style="background:#6B7280;color:#fff;padding:2px 8px;'
        'border-radius:4px;font-size:0.8em;font-weight:600;">неактивен</span>'
    )


class UserAdmin(ModelView, model=User):
    name = "Пользователь"
    name_plural = "Пользователи"
    icon = "fa-solid fa-users"

    column_list = [
        User.id,
        User.first_name,
        User.last_name,
        User.email,
        User.is_active,
        User.is_verified,
        User.created_at,
    ]
    column_searchable_list = [User.email, User.first_name, User.last_name]
    column_sortable_list = [User.created_at, User.is_verified, User.is_active]
    column_default_sort = [(User.created_at, True)]

    column_formatters = {
        User.is_verified: _fmt_bool_verified,
        User.is_active: _fmt_bool_active,
    }
    column_formatters_detail = {
        User.is_verified: _fmt_bool_verified,
        User.is_active: _fmt_bool_active,
    }

    column_details_exclude_list = [User.password_hash]
    form_excluded_columns = [User.password_hash]

    can_create = False
    can_delete = False


class EmailVerificationCodeAdmin(ModelView, model=EmailVerificationCode):
    name = "Код верификации"
    name_plural = "Коды верификации email"
    icon = "fa-solid fa-envelope-circle-check"

    column_list = [
        EmailVerificationCode.id,
        EmailVerificationCode.user_id,
        EmailVerificationCode.code,
        EmailVerificationCode.expires_at,
        EmailVerificationCode.created_at,
    ]
    column_sortable_list = [EmailVerificationCode.created_at, EmailVerificationCode.expires_at]
    column_default_sort = [(EmailVerificationCode.created_at, True)]

    can_create = False
    can_edit = False
    can_delete = True


class PasswordResetCodeAdmin(ModelView, model=PasswordResetCode):
    name = "Код сброса пароля"
    name_plural = "Коды сброса пароля"
    icon = "fa-solid fa-key"

    column_list = [
        PasswordResetCode.id,
        PasswordResetCode.user_id,
        PasswordResetCode.code,
        PasswordResetCode.expires_at,
        PasswordResetCode.created_at,
    ]
    column_sortable_list = [PasswordResetCode.created_at, PasswordResetCode.expires_at]
    column_default_sort = [(PasswordResetCode.created_at, True)]

    can_create = False
    can_edit = False
    can_delete = True


class StatsView(BaseView):
    name = "Статистика"
    icon = "fa-solid fa-chart-bar"
    engine = None  # устанавливается в create_admin перед add_base_view

    @expose("/stats", methods=["GET"])
    async def stats_page(self, request: Request) -> Response:
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        week_start = today_start - timedelta(days=6)

        async with AsyncSession(self.__class__.engine) as session:
            total = (await session.execute(select(func.count()).select_from(User))).scalar_one()
            verified = (await session.execute(
                select(func.count()).select_from(User).where(User.is_verified == True)  # noqa: E712
            )).scalar_one()
            active = (await session.execute(
                select(func.count()).select_from(User).where(User.is_active == True)  # noqa: E712
            )).scalar_one()
            new_today = (await session.execute(
                select(func.count()).select_from(User).where(User.created_at >= today_start)
            )).scalar_one()
            new_week = (await session.execute(
                select(func.count()).select_from(User).where(User.created_at >= week_start)
            )).scalar_one()

        stats = {
            "total": total,
            "verified": verified,
            "unverified": total - verified,
            "active": active,
            "inactive": total - active,
            "new_today": new_today,
            "new_week": new_week,
        }
        return await self.templates.TemplateResponse(
            request,
            "sqladmin/stats.html",
            {"title": "Статистика", "subtitle": "Сводка по пользователям", "stats": stats},
        )


class BlockedTokenAdmin(ModelView, model=BlockedToken):
    name = "Заблокированный токен"
    name_plural = "Заблокированные токены"
    icon = "fa-solid fa-ban"

    column_list = [
        BlockedToken.id,
        BlockedToken.jti,
        BlockedToken.exp,
    ]
    column_searchable_list = [BlockedToken.jti]
    column_sortable_list = [BlockedToken.exp]
    column_default_sort = [(BlockedToken.exp, True)]

    can_create = False
    can_edit = False
    can_delete = True
