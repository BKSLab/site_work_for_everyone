import { Container } from "@/components/layout/Container";

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
                    <h1
                        className="text-2xl font-bold text-foreground"
                        tabIndex={-1}
                    >
                        {title}
                    </h1>
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
