import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Избранная вакансия",
};

export default function FavoriteDetailLayout({ children }: { children: React.ReactNode }) {
    return children;
}
