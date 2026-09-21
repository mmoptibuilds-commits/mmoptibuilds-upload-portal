import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { AppShell } from "@/components/app-shell";
import { UploadWorkspace } from "@/components/upload-workspace";

export default async function UploadPage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  const { SUPABASE_URL, SUPABASE_STORAGE_BUCKET } = getEnv();
  return <AppShell user={user}><UploadWorkspace username={user.username} storageUrl={SUPABASE_URL} storageBucket={SUPABASE_STORAGE_BUCKET} /></AppShell>;
}
