"use client";

import { useId } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { ServiceError } from "@/components/ui/ServiceError";
import styles from "./SearchModal.module.css";

interface SearchModalProps {
    isPending: boolean;
    isError: boolean;
    isSuccess: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export function SearchModal({
    isPending,
    isError,
    isSuccess,
    isOpen,
    onClose,
}: SearchModalProps) {
    const descriptionId = useId();

    return (
        <Modal
            isOpen={isOpen}
            onOpenChange={onClose}
            title={isError ? "Ошибка поиска" : "Поиск вакансий"}
            containerClassName={styles.dialog}
            aria-describedby={isPending || isSuccess ? descriptionId : undefined}
        >
            {(isPending || isSuccess) && (
                <div className={styles.loading}>
                    <div className={styles.scene} aria-hidden="true">
                        <div className={styles.outerOrbit} />
                        <div className={styles.orbitPlane}>
                            <div className={styles.traveler}>
                                <span className={styles.satellite}>
                                    <Image src="/hh.ru.png" alt="" width={32} height={32} className={styles.hhLogo} />
                                </span>
                            </div>
                            <div className={`${styles.traveler} ${styles.opposite}`}>
                                <span className={`${styles.satellite} ${styles.russiaSatellite}`}>
                                    <Image src="/trudvsem.ru.png" alt="" width={68} height={30} className={styles.russiaLogo} />
                                </span>
                            </div>
                        </div>
                        <div className={styles.core}>
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="10.5" cy="10.5" r="6.5" />
                                <path d="m16 16 4.5 4.5" />
                            </svg>
                        </div>
                    </div>
                    <div className={styles.copy} role="status" aria-atomic="true" id={descriptionId}>
                        <p className={styles.message}>
                            Собираем вакансии с hh.ru и «Работы России»
                        </p>
                        <p className={styles.hint}>
                            Поиск может занять больше минуты. Пожалуйста, подождите.
                        </p>
                    </div>
                </div>
            )}

            {isError && (
                <div className="flex flex-col gap-4">
                    <ServiceError />
                    <Button variant="primary" onClick={onClose} className="w-full">
                        Закрыть
                    </Button>
                </div>
            )}
        </Modal>
    );
}
