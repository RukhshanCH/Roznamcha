import { useState, useEffect, useCallback } from "react";
import { getSetting, setSetting } from "@/db/indexedDB";

export function useSetting<T = string>(
  key: string,
  defaultValue: T
): [T, (val: T) => Promise<void>, boolean] {
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    getSetting<T>(key).then((stored) => {
      if (mounted && stored !== undefined) {
        setValue(stored);
      }
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [key]);

  const update = useCallback(async (newValue: T) => {
    setValue(newValue);
    await setSetting(key, newValue);
  }, [key]);

  return [value, update, loading];
}