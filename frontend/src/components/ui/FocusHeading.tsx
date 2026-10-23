"use client";

import { useRef, useEffect } from "react";

interface FocusHeadingProps {
    children: React.ReactNode;
    className?: string;
    id?: string;
    focusOnMount?: boolean;
}

export function FocusHeading({ children, className, id, focusOnMount = true }: FocusHeadingProps) {
    const ref = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (focusOnMount) ref.current?.focus({ preventScroll: true });
    }, [focusOnMount]);
    return (
        <h1 ref={ref} id={id} tabIndex={-1} className={`${className ?? ""} scroll-mt-28 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent`}>
            {children}
        </h1>
    );
}
