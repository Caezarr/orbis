import { WorkspaceProvider } from "@/components/shell/WorkspaceProvider";
import { ShellFrame } from "@/components/shell/ShellFrame";

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <WorkspaceProvider>
      <ShellFrame>{children}</ShellFrame>
    </WorkspaceProvider>
  );
}
