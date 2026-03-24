from typing import Annotated

from fastapi import Depends

from src.dependencies.db_session import DbSessionDep
from src.repositories.blocklist_repository import BlocklistRepository
from src.repositories.users import UsersRepository


def get_users_repository(session: DbSessionDep) -> UsersRepository:
    return UsersRepository(session)


def get_blocklist_repository(session: DbSessionDep) -> BlocklistRepository:
    return BlocklistRepository(session)


UsersRepositoryDep = Annotated[
    UsersRepository, Depends(get_users_repository)
]

BlocklistRepositoryDep = Annotated[
    BlocklistRepository, Depends(get_blocklist_repository)
]
