import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import styles from "./SectionHeading.module.css";

interface SectionHeadingProps {
    id: string;
    children: ReactNode;
    icon: ReactNode;
    action?: ReactNode;
    className?: string;
}

export function SectionHeading({ id, children, icon, action, className }: SectionHeadingProps) {
    return (
        <div className={cn(styles.heading, className)}>
            <div className={styles.label}>
                <span className={styles.emblem} aria-hidden="true">
                    <span className={styles.icon}>{icon}</span>
                </span>
                <h2 id={id} className={styles.title}>{children}</h2>
            </div>
            <span className={styles.orbit} aria-hidden="true" />
            {action && <div className={styles.action}>{action}</div>}
        </div>
    );
}
