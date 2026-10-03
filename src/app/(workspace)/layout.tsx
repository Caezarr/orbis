import { WorkspaceProvider } from "@/components/shell/WorkspaceProvider";
import { ShellFrame } from "@/components/shell/ShellFrame";
import { frozenSurfacesEnabled } from "@/lib/product/surfaces";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ShellFrame full={frozenSurfacesEnabled()}>{children}</ShellFrame>
    </WorkspaceProvider>
  );
}
