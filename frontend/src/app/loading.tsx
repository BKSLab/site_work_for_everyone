import { Container } from "@/components/layout/Container";

export default function Loading() {
    return (
        <Container className="py-12">
            <div role="status" aria-live="polite" className="text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-border border-t-accent motion-reduce:animate-none" />
                <span className="sr-only">Загрузка...</span>
            </div>
        </Container>
    );
}
