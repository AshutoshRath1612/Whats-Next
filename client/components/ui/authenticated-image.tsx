"use client";

import { ImgHTMLAttributes, ReactNode, useEffect, useMemo, useState } from "react";

type AuthenticatedImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  token?: string | null;
  fallback?: ReactNode;
};

export function AuthenticatedImage({ src, token, fallback = null, onError, ...props }: AuthenticatedImageProps) {
  const protectedSource = useMemo(() => isProtectedFileContentUrl(src), [src]);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setObjectUrl(null);
    if (!src || !protectedSource) return;

    let active = true;
    let nextObjectUrl: string | null = null;

    fetch(src, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    })
      .then((response) => {
        if (!response.ok) throw new Error("Image request failed");
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
    };
  }, [protectedSource, src, token]);

  if (!src || failed) return <>{fallback}</>;
  const resolvedSource = protectedSource ? objectUrl : src;
  if (!resolvedSource) return <>{fallback}</>;

  return (
    <img
      {...props}
      src={resolvedSource}
      onError={(event) => {
        setFailed(true);
        onError?.(event);
      }}
    />
  );
}

function isProtectedFileContentUrl(value?: string | null) {
  if (!value) return false;
  return value.includes("/files/") && value.endsWith("/content");
}
