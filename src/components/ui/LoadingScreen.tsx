import { useEffect, useState } from "react";
import { useSetting } from "@/hooks/useSetting";
import Logo from "../../assets/Logo.webp";

const LoadingScreen = () => {
    const [profilePic] = useSetting<string | null>("profilePic", null);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProgress((prev) => {
                if (prev >= 100) {
                    clearInterval(interval);
                    return 100;
                }
                return prev + 2;
            });
        }, 30);

        return () => clearInterval(interval);
    }, []);

    return (
        <div dir="ltr" className="loading-screen">
            <div className="bg-orb orb1"></div>
            <div className="bg-orb orb2"></div>

            {[...Array(18)].map((_, i) => (
                <span
                    key={i}
                    className="particle"
                    style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`,
                    }}
                />
            ))}

            <div className="glass-card">
                <img src={profilePic || Logo} className="loading-logo" alt="Roznamcha" />

                <h2>Roznamcha</h2>

                <div className="progress">
                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                </div>

                <span>{progress}%</span>
            </div>
        </div>
    );
};

export default LoadingScreen;