import NextImage, { type ImageProps } from "next/image";

function isUnsplashImage(src: ImageProps["src"]): boolean {
  return typeof src === "string" && /^https:\/\/images\.unsplash\.com\//i.test(src);
}

/**
 * Keeps Cloudflare optimization for resort-owned R2 images while allowing
 * external Unsplash assets to load directly if Cloudflare's remote transform
 * path is unavailable.
 */
export default function StorefrontImage({ src, unoptimized, ...props }: ImageProps) {
  return <NextImage src={src} unoptimized={unoptimized || isUnsplashImage(src)} {...props} />;
}