"use client";

import Script from "next/script";

type TurnstileWindow = Window & {
  turnstile?: {
    reset: () => void;
  };
};

export function resetTurnstileWidget(): void {
  (window as TurnstileWindow).turnstile?.reset();
}

export function TurnstileWidget({
  className,
  siteKey
}: {
  className?: string;
  siteKey: string;
}) {
  if (!siteKey) return null;

  return (
    <div className={className}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
      />
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-theme="auto"
        data-size="flexible"
      />
    </div>
  );
}
