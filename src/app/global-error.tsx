"use client";
import "./globals.css";
import { ErrorPanel } from "@/components/ErrorPanel";

/**
 * Last resort: the root layout itself failed, so this file owns the document. It imports
 * the same stylesheet the layout does, so the panel keeps the Aloud look.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6">
          <ErrorPanel onRetry={reset} digest={error.digest} where="Aloud" />
        </main>
      </body>
    </html>
  );
}
