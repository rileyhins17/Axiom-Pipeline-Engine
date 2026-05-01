"use client";
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface PerformancePrefs {
    reducedMotion: boolean;
}

interface PerformanceCtx extends PerformancePrefs {
    toggle: () => void;
}

const PerformanceContext = createContext<PerformanceCtx>({
    reducedMotion: false,
    toggle: () => { },
});

const STORAGE_KEY = "omniscient-perf-mode";

export function PerformanceProvider({ children }: { children: ReactNode }) {
    const [reducedMotion, setReducedMotion] = useState(() => {
        if (typeof window === "undefined") return false;
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) return stored === "true";
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    });

    useEffect(() => {
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

        const handler = (e: MediaQueryListEvent) => {
            if (localStorage.getItem(STORAGE_KEY) === null) {
                setReducedMotion(e.matches);
            }
        };
        mq.addEventListener("change", handler);
        return () => mq.removeEventListener("change", handler);
    }, []);

    useEffect(() => {
        document.documentElement.classList.toggle("perf-mode", reducedMotion);
    }, [reducedMotion]);

    const toggle = () => {
        setReducedMotion(prev => {
            const next = !prev;
            localStorage.setItem(STORAGE_KEY, String(next));
            return next;
        });
    };

    return (
        <PerformanceContext.Provider value={{ reducedMotion, toggle }}>
            {children}
        </PerformanceContext.Provider>
    );
}

export function usePerformance() {
    return useContext(PerformanceContext);
}
