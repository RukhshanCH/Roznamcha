import { useAtom } from 'jotai';
import { showModalAtom } from '@/store/atoms';
import "@/styles/backup.css"
import { useEffect } from 'react';

interface ModalProps {
    title: string;
    submitText: string;
    handleSubmit: () => void | Promise<void>;
    children?: React.ReactNode;
    type?: "button" | "submit" | "reset";
    ariaLabel?: string;
}

const Modal = ({ title, submitText, handleSubmit, children, type = "button", ariaLabel }: ModalProps) => {
    const [showModal, setShowModal] = useAtom(showModalAtom);

    const onSubmit = async () => {
        await handleSubmit();
        setShowModal(false);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setShowModal(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [setShowModal]);

    return (
        <>
            {showModal && (
                <div
                    className="modal-overlay"
                    onClick={() => setShowModal(false)}
                >
                    <div
                        className="modal"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h4>{title}</h4>
                        {children}

                        <div className="modal-actions urdu">
                            <button
                                className="btn cancel-btn"
                                onClick={() => setShowModal(false)}
                                type="button"
                                aria-label="Cancel"
                            >
                                منسوخ
                            </button>

                            <button
                                className="btn export-btn"
                                onClick={onSubmit}
                                type={type}
                                aria-label={ariaLabel}
                                autoFocus
                            >
                                {submitText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default Modal;