from fastapi import status


class UsersServiceError(Exception):
    """Общий класс исключений для сервиса работы с пользователями."""
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, error_details: str):
        self.error_details = error_details
        super().__init__(self.error_details)

    def __str__(self) -> str:
        return f"An error occurred in the Users service. Details: {self.error_details}"
    
    @property
    def detail(self) -> str:
        return f"An error occurred while processing user data. Details: {self.error_details}"


class BlocklistServiceError(Exception):
    """Класс исключений для сервиса работы с черным списком токенов."""
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR

    def __init__(self, error_details: str):
        self.error_details = error_details
        super().__init__(self.error_details)

    def __str__(self) -> str:
        return f"An error occurred in the Blocklist service. Details: {self.error_details}"

    @property
    def detail(self) -> str:
        return f"An error occurred in the blocklist service. Details: {self.error_details}"


class VeraPublisherError(Exception):
    """Публикация сообщения агенту «Вера» в очередь RabbitMQ не удалась."""
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    def __init__(self, error_details: str):
        self.error_details = error_details
        super().__init__(self.error_details)

    def __str__(self) -> str:
        return f"An error occurred while publishing to Vera queue. Details: {self.error_details}"

    @property
    def detail(self) -> str:
        return "Ассистент временно недоступен."


class VeraAgentServiceError(Exception):
    """Agent Service не принял или не смог обработать HTTP-запрос."""

    def __init__(
        self,
        *,
        status_code: int,
        detail: object,
        error_details: str,
    ):
        self.status_code = status_code
        self.detail = detail
        self.error_details = error_details
        super().__init__(self.error_details)

    def __str__(self) -> str:
        return (
            "An error occurred while calling Vera Agent Service. "
            f"Details: {self.error_details}"
        )


class VeraSessionTokenError(Exception):
    """Подписанный токен анонимной сессии отсутствует или невалиден."""

    status_code = 401
    detail = "Сессия чата не подтверждена."


class VeraStreamTicketServiceError(Exception):
    """Не удалось безопасно выпустить ticket SSE-потока."""

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    detail = "Ассистент временно недоступен."

    def __init__(self, error_details: str):
        self.error_details = error_details
        super().__init__(self.error_details)

    def __str__(self) -> str:
        return f"Не удалось выпустить stream ticket. Детали: {self.error_details}"
