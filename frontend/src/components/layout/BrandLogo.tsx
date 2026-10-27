/* eslint-disable @next/next/no-img-element */

// The Derivion wordmark. "light" is the white version for dark backgrounds.
// Source files: public/brand (copied from the derivion.in website assets).
export default function BrandLogo({ height = 30, variant = "dark" }: { height?: number; variant?: "dark" | "light" }) {
  return (
    <img
      src={variant === "light" ? "/brand/derivion-logo-white.png" : "/brand/derivion-logo.png"}
      alt="Derivion"
      height={height}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
