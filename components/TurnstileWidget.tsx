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
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

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
    if (!siteKey || !containerRef.current || widgetIdRef.current) return;

    let retryId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function renderWidget() {
      if (cancelled || !containerRef.current || widgetIdRef.current) return;
      const turnstile = (window as TurnstileWindow).turnstile;

      if (!turnstile) {
        retryId = setTimeout(renderWidget, 150);
        return;
      }

      widgetIdRef.current = turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        size: "normal",
        callback: setToken,
        "expired-callback": () => setToken(""),
        "error-callback": () => setToken("")
      });
    }

    if (scriptReady || (window as TurnstileWindow).turnstile) {
      renderWidget();
    }

    return () => {
      cancelled = true;
      if (retryId) clearTimeout(retryId);
    };
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
        src={TURNSTILE_SCRIPT_SRC}
        strategy="afterInteractive"
        async
        defer
        onLoad={() => setScriptReady(true)}
        onReady={() => setScriptReady(true)}
      />
      <input type="hidden" name="cf-turnstile-response" value={token} />
      <div ref={containerRef} className="min-h-[65px] w-full max-w-[320px]" />
    </div>
  );
}

export const TurnstileWidget = memo(TurnstileWidgetComponent);
