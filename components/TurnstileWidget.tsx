"use client";

import { memo, useEffect, useRef, useState } from "react";
import Script from "next/script";

type TurnstileWindow = Window & {
  turnstile?: {
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        theme?: "auto" | "light" | "dark";
        size?: "normal" | "compact" | "flexible";
        callback?: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      }
    ) => string;
    remove?: (widgetId: string) => void;
    reset: (widgetId?: string) => void;
  };
};

const TURNSTILE_RESET_EVENT = "mcr:turnstile-reset";

export function resetTurnstileWidget(): void {
  window.dispatchEvent(new Event(TURNSTILE_RESET_EVENT));
  (window as TurnstileWindow).turnstile?.reset();
}

function TurnstileWidgetComponent({
  className,
  siteKey
}: {
  className?: string;
  siteKey: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    if (!scriptReady || !siteKey || !containerRef.current || widgetIdRef.current) return;

    const turnstile = (window as TurnstileWindow).turnstile;
    if (!turnstile) return;

    widgetIdRef.current = turnstile.render(containerRef.current, {
      sitekey: siteKey,
      theme: "auto",
      size: "flexible",
      callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken("")
    });
  }, [scriptReady, siteKey]);

  useEffect(() => {
    function handleReset() {
      setToken("");
      const widgetId = widgetIdRef.current;
      if (widgetId) {
        (window as TurnstileWindow).turnstile?.reset(widgetId);
      }
    }

    window.addEventListener(TURNSTILE_RESET_EVENT, handleReset);
    return () => window.removeEventListener(TURNSTILE_RESET_EVENT, handleReset);
  }, []);

  useEffect(() => {
    return () => {
      const widgetId = widgetIdRef.current;
      if (widgetId) {
        (window as TurnstileWindow).turnstile?.remove?.(widgetId);
      }
      widgetIdRef.current = null;
    };
  }, []);

  if (!siteKey) return null;

  return (
    <div className={className}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
        async
        defer
        onReady={() => setScriptReady(true)}
      />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <div ref={containerRef} />
    </div>
  );
}

export const TurnstileWidget = memo(TurnstileWidgetComponent);
