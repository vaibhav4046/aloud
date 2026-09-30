"use client";
import { ErrorPanel } from "@/components/ErrorPanel";

/** Any route outside the app shell (landing, about, terms). The root layout still wraps it. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
      <ErrorPanel onRetry={reset} digest={error.digest} where="this page" />
    </main>
  );
}
