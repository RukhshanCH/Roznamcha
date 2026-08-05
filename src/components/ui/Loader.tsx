import { useEffect, useState } from "react";
import { useSetting } from "@/hooks/useSetting";
import { motion } from "framer-motion";
import Logo from "../../assets/Logo.png";

const Loader = () => {
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
    <motion.div
      dir="ltr"
      className="loading-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
    >
      <div className="bg-orb orb1"></div>
      <div className="bg-orb orb2"></div>

      {[...Array(18)].map((_, i) => (
        <motion.span
          key={i}
          className="particle"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
          }}
          animate={{
            y: [-20, 20, -20],
            opacity: [0.2, 0.8, 0.2],
          }}
          transition={{
            duration: 4 + Math.random() * 4,
            repeat: Infinity,
          }}
        />
      ))}

      <motion.div
        className="glass-card"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        <motion.img
          src={profilePic || Logo}
          className="loading-logo"
          alt="Roznamcha"
          animate={{
            y: [0, -8, 0],
            rotate: [0, 2, -2, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
          }}
        />

        <h2>Roznamcha</h2>

        <div className="progress">
          <motion.div
            className="progress-fill"
            animate={{
              width: `${progress}%`,
            }}
          />
        </div>

        <span>{progress}%</span>
      </motion.div>
    </motion.div>
  );
};

export default Loader;