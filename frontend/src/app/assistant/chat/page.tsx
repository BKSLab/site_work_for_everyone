import { Container } from "@/components/layout/Container";
import { ChatWindow } from "@/components/features/vera/ChatWindow";
import { VeraScopeNotice } from "@/components/features/vera/VeraScopeNotice";

export default function AssistantChatPage() {
    return (
        <Container className="min-w-0 py-4 sm:py-6">
            <div className="flex w-full min-w-0 flex-col gap-4">
                <VeraScopeNotice />
                <ChatWindow />
            </div>
        </Container>
    );
}
