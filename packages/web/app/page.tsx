import type { Metadata } from "next";

// The layout title template only applies to child segments, not this page.
export const metadata: Metadata = {
  title: { absolute: "Harnesses · Daily Usage" },
};

// The root layout renders every tab; the page only names the route.
export default function Page() {
  return null;
}
