"use client";

import { useEffect, useState } from "react";

/** Focus after React has rendered the field's error and description. */
export function useFormErrorFocus() {
    const [target, setTarget] = useState<{ id: string } | null>(null);

    useEffect(() => {
        if (target) document.getElementById(target.id)?.focus();
    }, [target]);

    return (orderedIds: Array<string | false | undefined>) => {
        const id = orderedIds.find((value): value is string => typeof value === "string");
        if (id) setTarget({ id });
    };
}
