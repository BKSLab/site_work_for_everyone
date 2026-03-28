"use client";

import { Suspense } from "react";
import { Container } from "@/components/layout/Container";
import { AssistantFlow } from "@/components/features/assistant/AssistantFlow";
import { Spinner } from "@/components/ui/Spinner";

export default function AssistantStartPage() {
    return (
        <Container className="py-12">
            <Suspense fallback={
                <div className="flex items-center gap-3 py-8">
                    <Spinner />
                    <p className="text-sm text-muted">Загрузка ассистента…</p>
                </div>
            }>
                <AssistantFlow />
            </Suspense>
        </Container>
    );
}
