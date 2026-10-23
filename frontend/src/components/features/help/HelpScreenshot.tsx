"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { Modal } from "@/components/ui/Modal";

interface HelpScreenshotProps {
    src: string;
    alt: string;
    caption: string;
    width: number;
    height: number;
}

export function HelpScreenshot({ src, alt, caption, width, height }: HelpScreenshotProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [originalSize, setOriginalSize] = useState(false);
    const descriptionId = useId();
    const cropped = height > width * 1.4;

    function onOpenChange(open: boolean) {
        setIsOpen(open);
        if (!open) setOriginalSize(false);
    }

    return (
        <figure className="my-5">
            <button
                type="button"
                aria-label={`Увеличить снимок: ${caption}`}
                aria-haspopup="dialog"
                onClick={() => setIsOpen(true)}
                className="group relative block w-full cursor-zoom-in rounded-xl border border-border bg-surface text-left"
            >
                <Image
                    src={src}
                    alt={alt}
                    width={width}
                    height={height}
                    sizes="(min-width: 1024px) 712px, calc(100vw - 32px)"
                    className={`h-auto w-full rounded-xl ${cropped ? "max-h-96 object-cover object-top sm:max-h-[32rem]" : ""}`}
                />
                <span className="absolute right-2 bottom-2 rounded-md border border-accent/40 bg-background/95 px-2 py-1 text-xs font-semibold text-accent">
                    {cropped ? "Показать целиком" : "Увеличить"}
                </span>
            </button>
            <figcaption className="mt-2 text-sm leading-relaxed text-muted">{caption}</figcaption>
            {isOpen && (
                <Modal
                    title="Снимок экрана"
                    isOpen
                    onOpenChange={onOpenChange}
                    aria-describedby={descriptionId}
                    containerClassName="vera-chat-scrollbar max-h-[calc(100dvh-2rem)] max-w-6xl overflow-y-auto"
                >
                    <p id={descriptionId} className="mb-3 text-sm leading-relaxed text-muted">
                        {caption} Закройте окно клавишей Escape, чтобы вернуться к справке.
                    </p>
                    <button
                        type="button"
                        aria-pressed={originalSize}
                        onClick={() => setOriginalSize(!originalSize)}
                        className="mb-3 min-h-11 rounded-lg border border-accent/50 px-3 py-2 text-sm font-semibold text-accent"
                    >
                        {originalSize ? "Вписать в окно" : "Исходный размер"}
                    </button>
                    <div
                        role="region"
                        aria-label="Просмотр снимка экрана"
                        tabIndex={0}
                        className="vera-chat-scrollbar max-h-[60dvh] overflow-auto rounded-lg border border-border bg-background"
                    >
                        <Image
                            src={src}
                            alt={alt}
                            width={width}
                            height={height}
                            unoptimized
                            className="h-auto"
                            style={{ width, maxWidth: originalSize ? "none" : "100%" }}
                        />
                    </div>
                </Modal>
            )}
        </figure>
    );
}
