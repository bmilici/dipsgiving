/** Build-time development-preview switch. An unset flag preserves normal behavior. */
export const isTestingMode = process.env.NEXT_PUBLIC_DESIGN_PREVIEW === "true";

/** Next Link adds basePath itself; public image and icon URLs need it explicitly. */
export function testingAssetPath(path: string): string {
  if (
    !isTestingMode ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path === "/testing" ||
    path.startsWith("/testing/")
  ) {
    return path;
  }
  return `/testing${path}`;
}
