import { ProtectedRoute } from "@/components/auth/protected-route";
import { ProductWorkspace } from "@/components/workspace/product-workspace";

export default function Home() {
  return (
    <ProtectedRoute>
      <ProductWorkspace />
    </ProtectedRoute>
  );
}
