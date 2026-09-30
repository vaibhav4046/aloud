"use client";
import { ErrorPanel } from "@/components/ErrorPanel";

export default function RunError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel onRetry={reset} digest={error.digest} where="your run" />;
}
