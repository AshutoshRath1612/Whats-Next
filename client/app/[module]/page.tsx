import { notFound } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { ProductWorkspace } from "@/components/workspace/product-workspace";
import { moduleSlugToView, viewToModuleSlug } from "@/lib/workspace/routes";

export function generateStaticParams() {
  return Object.values(viewToModuleSlug)
    .filter(Boolean)
    .map((module) => ({ module }));
}

export default function WorkspaceModulePage({ params }: { params: { module: string } }) {
  const initialView = moduleSlugToView[params.module];

  if (!initialView) {
    notFound();
  }

  return (
    <ProtectedRoute>
      <ProductWorkspace initialView={initialView} />
    </ProtectedRoute>
  );
}
