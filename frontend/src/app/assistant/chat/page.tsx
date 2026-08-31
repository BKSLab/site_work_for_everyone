import type { Metadata, Viewport } from "next";
import { Container } from "@/components/layout/Container";
import { ChatWindow } from "@/components/features/vera/ChatWindow";
import { VeraScopeNotice } from "@/components/features/vera/VeraScopeNotice";

export const metadata: Metadata = {
    title: "Чат с Ассистентом Верой",
    description:
        "Консультация Ассистента Веры по трудовым правам, льготам и трудоустройству людей с инвалидностью.",
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    interactiveWidget: "resizes-content",
};

export default function AssistantChatPage() {
    return (
        <Container className="vera-chat-page min-w-0 py-4 max-sm:flex max-sm:h-full max-sm:max-w-none max-sm:px-0 max-sm:py-0 sm:py-6">
            <div className="flex w-full min-w-0 flex-col gap-4 max-sm:min-h-0 max-sm:flex-1 max-sm:gap-0">
                <VeraScopeNotice />
                <ChatWindow />
            </div>
        </Container>
    );
}
