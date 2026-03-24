import Link from "next/link";
import { Container } from "@/components/layout/Container";

export default function NotFound() {
    return (
        <Container className="py-12 text-center">
            <h1 className="text-3xl font-bold text-foreground">
                Страница не найдена
            </h1>
            <p className="mt-4 text-muted">
                Запрашиваемая страница не существует.
            </p>
            <Link
                href="/"
                className="mt-6 inline-block rounded bg-accent px-6 py-2 font-medium text-accent-foreground hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
                На главную
            </Link>
        </Container>
    );
}
