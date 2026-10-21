import { Container } from "@/components/layout/Container";
import { FocusHeading } from "@/components/ui/FocusHeading";

interface AuthFormLayoutProps {
    title: string;
    description?: string;
    children: React.ReactNode;
}

export function AuthFormLayout({
    title,
    description,
    children,
}: AuthFormLayoutProps) {
    return (
        <Container className="py-12">
            <div className="mx-auto max-w-md">
                <div className="rounded-lg border border-border bg-surface p-6">
                    <FocusHeading className="rounded text-2xl font-bold text-foreground">
                        {title}
                    </FocusHeading>
                    {description && (
                        <p className="mt-2 text-sm text-muted">
                            {description}
                        </p>
                    )}
                    <div className="mt-6">{children}</div>
                </div>
            </div>
        </Container>
    );
}
