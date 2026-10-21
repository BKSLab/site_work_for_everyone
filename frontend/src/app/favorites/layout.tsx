import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Избранные вакансии",
};

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
    return children;
}
