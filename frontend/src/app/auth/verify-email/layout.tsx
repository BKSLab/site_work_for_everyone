import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Подтверждение email",
};

export default function VerifyEmailLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
