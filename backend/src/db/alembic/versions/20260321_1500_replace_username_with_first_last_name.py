"""Replace username with first_name and last_name, add updated_at

Revision ID: b3f2a1c9d4e8
Revises: 1a8a6555cbe1
Create Date: 2026-03-21 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b3f2a1c9d4e8'
down_revision: Union[str, None] = '1a8a6555cbe1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('users', 'username')
    op.add_column('users', sa.Column('first_name', sa.String(length=100), nullable=False, server_default=''))
    op.add_column('users', sa.Column('last_name', sa.String(length=100), nullable=False, server_default=''))
    op.add_column('users', sa.Column(
        'updated_at',
        sa.DateTime(timezone=True),
        nullable=False,
        server_default=sa.func.now(),
    ))
    # Убираем server_default после заполнения — поле обязательное, но дефолт нужен только для миграции
    op.alter_column('users', 'first_name', server_default=None)
    op.alter_column('users', 'last_name', server_default=None)


def downgrade() -> None:
    op.drop_column('users', 'updated_at')
    op.drop_column('users', 'last_name')
    op.drop_column('users', 'first_name')
    op.add_column('users', sa.Column('username', sa.String(length=100), nullable=True))
