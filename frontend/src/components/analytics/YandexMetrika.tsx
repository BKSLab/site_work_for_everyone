"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

declare global {
    interface Window {
        ym?: (id: number, action: string, url: string) => void;
    }
}

const COUNTER_ID = 108776390;

export function YandexMetrika() {
    const pathname = usePathname();

    useEffect(() => {
        window.ym?.(COUNTER_ID, "hit", pathname);
    }, [pathname]);

    return null;
}
