"use client";

import { Container } from "@/components/layout/Container";
import { ServiceError } from "@/components/ui/ServiceError";

export default function Error({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <Container className="py-12">
            <ServiceError onRetry={reset} />
        </Container>
    );
}
