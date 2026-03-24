from markupsafe import Markup
from sqladmin import ModelView

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
