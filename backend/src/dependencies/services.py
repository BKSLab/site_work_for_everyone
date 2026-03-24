from typing import Annotated

from fastapi import Depends

from src.dependencies.repositories import (
    BlocklistRepositoryDep,
    UsersRepositoryDep,
)
from src.services.blocklist import BlocklistService
from src.services.users import UsersService


async def get_users_service(
    users_repository: UsersRepositoryDep
) -> UsersService:
    """Генератор для создания сессии базы данных."""
    return UsersService(
        users_repository=users_repository
    )


async def get_blocklist_service(
    blocklist_repository: BlocklistRepositoryDep
) -> BlocklistService:
    """Зависимость для сервиса черного списка токенов."""
    return BlocklistService(blocklist_repo=blocklist_repository)


UsersServiceDep = Annotated[
    UsersService, Depends(get_users_service)
]
BlocklistServiceDep = Annotated[
    BlocklistService, Depends(get_blocklist_service)
]
