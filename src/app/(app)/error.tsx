"use client";
import { ErrorPanel } from "@/components/ErrorPanel";

/** Any app route. It renders inside the app shell, so the header and the nav stay usable. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorPanel onRetry={reset} digest={error.digest} where="this screen" />;
}
