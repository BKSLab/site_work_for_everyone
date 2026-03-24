from src.dependencies.jwt import JWTManagerDep
from src.schemas.users import TokenResponseSchema


async def create_token_pair(
    jwt_manager: JWTManagerDep,
    user_email: str,
    first_name: str,
    last_name: str,
) -> TokenResponseSchema:
    """Вспомогательная функция для генерации пары токенов, access и refresh."""
    payload = {"sub": user_email, "first_name": first_name, "last_name": last_name}

    access_token = jwt_manager.create_access_token(payload=payload)
    refresh_token = jwt_manager.create_refresh_token(payload=payload)

    return TokenResponseSchema(access_token=access_token, refresh_token=refresh_token)
