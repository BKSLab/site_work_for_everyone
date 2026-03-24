import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Регистрация",
};

export default function RegisterLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
