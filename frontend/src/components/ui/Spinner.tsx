"use client";

import { cn } from "@/lib/utils/cn";

interface SpinnerProps {
    className?: string;
}

// Задержки по порядку ячейки Брайля: левый столбец (точки 1→2→3), правый (4→5→6)
// Позиции в grid-cols-2: [0,2,4] — левый, [1,3,5] — правый
const BRAILLE_DELAYS = [
    0,      // точка 1 (левый верх)
    0.375,  // точка 4 (правый верх)
    0.125,  // точка 2 (левый середина)
    0.5,    // точка 5 (правый середина)
    0.25,   // точка 3 (левый низ)
    0.625,  // точка 6 (правый низ)
];

export function Spinner({ className }: SpinnerProps) {
    return (
        <div
            role="status"
            aria-label="Загрузка..."
            className={cn("flex items-center justify-center", className)}
        >
            {/* Ячейка Брайля — скрыта от скринридеров */}
            <div
                aria-hidden="true"
                className="grid grid-cols-2 gap-x-2 gap-y-2.5"
            >
                {BRAILLE_DELAYS.map((delay, i) => (
                    <div
                        key={i}
                        className="h-3 w-3 rounded-full"
                        style={{
                            animation: `braille-dot 1.5s ease-in-out infinite`,
                            animationDelay: `${delay}s`,
                        }}
                    />
                ))}
            </div>
        </div>
    );
}
