"use client";

import { Container } from "@/components/layout/Container";
import { ServiceError } from "@/components/ui/ServiceError";

export default function Error() {
    return (
        <Container className="py-12">
            <ServiceError />
        </Container>
    );
}
