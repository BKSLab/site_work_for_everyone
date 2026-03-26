"use client";

import { Suspense } from "react";
import { Container } from "@/components/layout/Container";
import { AssistantFlow } from "@/components/features/assistant/AssistantFlow";

export default function AssistantStartPage() {
    return (
        <Container className="py-12">
            <Suspense>
                <AssistantFlow />
            </Suspense>
        </Container>
    );
}
