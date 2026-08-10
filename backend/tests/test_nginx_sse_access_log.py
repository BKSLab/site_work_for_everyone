import re
import unittest
from pathlib import Path


NGINX_TEMPLATE = (
    Path(__file__).resolve().parents[2]
    / "nginx"
    / "templates"
    / "default.conf.template"
)


def _server_blocks(config: str) -> list[str]:
    return re.split(r"(?m)^\s*server\s*\{\s*$", config)[1:]


def _sse_access_logs(server: str) -> list[str]:
    match = re.search(
        r"(?ms)^\s*location\s+/vera/sse/\s*\{\s*(.*?)^\s*\}",
        server,
    )
    if match is None:
        return []

    body = "\n".join(
        line.split("#", 1)[0] for line in match.group(1).splitlines()
    )
    return [
        " ".join(directive.split())
        for directive in re.findall(
            r"(?m)^\s*access_log\s+[^;]+;",
            body,
        )
    ]


class NginxSseAccessLogTests(unittest.TestCase):
    def test_ticket_query_is_not_written_by_http_or_https_sse_locations(
        self,
    ) -> None:
        servers = _server_blocks(NGINX_TEMPLATE.read_text(encoding="utf-8"))

        for listen in ("listen 80;", "listen 443 ssl;"):
            matching = [server for server in servers if listen in server]
            self.assertEqual(len(matching), 1, listen)
            self.assertEqual(
                _sse_access_logs(matching[0]),
                ["access_log off;"],
                listen,
            )


if __name__ == "__main__":
    unittest.main()
